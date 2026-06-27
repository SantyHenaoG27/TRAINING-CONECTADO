import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Verificar que viene de un admin autenticado
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'No autorizado' }, 401);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // Validar JWT y obtener el usuario que hace la llamada
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Token inválido' }, 401);

  // Verificar que el caller tiene rol admin en profiles
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return json({ error: 'Acceso denegado: se requiere rol admin' }, 403);

  // Parsear body
  let body: { nombre?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { nombre, email, password } = body;
  if (!nombre || !email || !password) return json({ error: 'nombre, email y password son requeridos' }, 400);
  if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

  // Crear usuario en Supabase Auth (confirmado directamente, sin correo)
  const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !newUser.user) {
    return json({ error: createErr?.message ?? 'Error al crear el usuario' }, 400);
  }

  // Actualizar perfil (el trigger de auth ya lo crea vacío)
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: newUser.user.id, nombre, role: 'estudiante' }, { onConflict: 'id' });

  if (profileErr) {
    // Revertir: borrar el usuario auth creado
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
    return json({ error: 'Error al crear el perfil: ' + profileErr.message }, 500);
  }

  return json({ ok: true, userId: newUser.user.id });
});

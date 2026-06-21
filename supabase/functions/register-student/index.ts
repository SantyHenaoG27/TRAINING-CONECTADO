import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  let body: { nombre?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { nombre, email, password } = body;
  if (!nombre || !email || !password) return json({ error: 'nombre, email y password son requeridos' }, 400);
  if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !newUser.user) {
    return json({ error: createErr?.message ?? 'Error al crear el usuario' }, 400);
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({ id: newUser.user.id, nombre, role: 'estudiante' }, { onConflict: 'id' });

  if (profileErr) {
    await supabase.auth.admin.deleteUser(newUser.user.id);
    return json({ error: 'Error al crear el perfil: ' + profileErr.message }, 500);
  }

  return json({ ok: true });
});

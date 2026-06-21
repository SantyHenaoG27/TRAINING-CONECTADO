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

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'No autorizado' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Token inválido' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return json({ error: 'Acceso denegado: se requiere rol admin' }, 403);

  let body: { studentId?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { studentId } = body;
  if (!studentId) return json({ error: 'studentId es requerido' }, 400);

  const { error } = await supabase.auth.admin.deleteUser(studentId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});

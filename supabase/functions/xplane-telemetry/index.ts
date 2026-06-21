import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SESSION_OWNER_CACHE_TTL_MS = 15_000;
const PRESENCE_STALE_MS          = 40_000;
const sessionOwnerCache = new Map<string, { claimed: boolean; studentId: string | null; assignmentId: string | null; expiresAt: number }>();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function getSessionOwner(sessionCode: string) {
  const now    = Date.now();
  const cached = sessionOwnerCache.get(sessionCode);
  if (cached && cached.expiresAt > now) return cached;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, active_assignment_id, last_active_at')
    .eq('session_code', sessionCode)
    .maybeSingle();

  let owner: { claimed: boolean; studentId: string | null; assignmentId: string | null };
  if (error) {
    owner = cached ?? { claimed: false, studentId: null, assignmentId: null };
  } else {
    const isPresent = !!data?.last_active_at
      && (now - new Date(data.last_active_at).getTime()) < PRESENCE_STALE_MS;
    owner = {
      claimed:      !!data && isPresent,
      studentId:    data?.id ?? null,
      assignmentId: data?.active_assignment_id ?? null,
    };
  }

  sessionOwnerCache.set(sessionCode, { ...owner, expiresAt: now + SESSION_OWNER_CACHE_TTL_MS });
  return owner;
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const sessionCode = p.sessionCode as string;
  const flightId    = p.flightId    as string;
  if (!sessionCode || !flightId) {
    return new Response(JSON.stringify({ ok: false, error: 'sessionCode y flightId requeridos' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 1. Upsert flight_sessions — siempre, para que la web detecte el simulador
  const { error: sessionErr } = await supabase
    .from('flight_sessions')
    .upsert(
      { session_code: sessionCode, last_seen: new Date().toISOString(), on_ground: p.onGround },
      { onConflict: 'session_code' }
    );

  if (sessionErr) console.error('flight_sessions error:', sessionErr.message);

  // 2. Insertar telemetría detallada solo si hay estudiante activo vinculado
  const owner = await getSessionOwner(sessionCode);
  if (owner.claimed) {
    const { error: telErr } = await supabase
      .from('flight_telemetry')
      .insert({
        session_code:  sessionCode,
        flight_id:     flightId,
        student_id:    owner.studentId,
        assignment_id: owner.assignmentId,
        latitude:      p.latitude,
        longitude:     p.longitude,
        altitude_ft:   p.altitudeFt,
        heading_deg:   p.headingDeg,
        ias_kt:        p.indicatedAirspeedKt,
        gs_kt:         p.groundSpeedKt,
        vs_fpm:        p.verticalSpeedFpm,
        pitch_deg:     p.pitchDeg,
        bank_deg:      p.bankDeg,
        on_ground:     p.onGround,
        sim_time:      p.timestamp,
      });

    if (telErr) console.error('flight_telemetry error:', telErr.message);
  }

  return new Response(JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

require('dotenv').config();
const http       = require('http');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const PORT          = parseInt(process.env.PORT || '3001', 10);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[ERROR] Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}

function log(sessionCode, data) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(
    `[${ts}] ${sessionCode.padEnd(10)} |` +
    ` Lat ${data.latitude.toFixed(4)}` +
    ` Lon ${data.longitude.toFixed(4)}` +
    ` Alt ${Math.round(data.altitudeFt).toString().padStart(6)}ft` +
    ` IAS ${Math.round(data.indicatedAirspeedKt)}kt` +
    ` HDG ${Math.round(data.headingDeg)}°` +
    (data.onGround ? ' [GND]' : '')
  );
}

// ── Session ownership cache ───────────────────────────────────────────────────
// flight_telemetry is high-volume (one row per packet), so we only persist it
// when a logged-in student both (a) has claimed this session via "Conectar
// simulador" (profiles.session_code) AND (b) currently has the student panel
// open — evidenced by a fresh profiles.last_active_at heartbeat. Anything else
// (plugin running unclaimed, or claimed but the page is closed/logged out)
// would just waste storage and isn't persisted.
//
// The student panel heartbeats every 15s (PRESENCE_HEARTBEAT_MS in student.html);
// PRESENCE_STALE_MS gives it a couple of missed beats of slack before we treat
// the student as "not present".
const SESSION_OWNER_CACHE_TTL_MS = 15000;
const PRESENCE_STALE_MS = 40000;
const sessionOwnerCache = new Map(); // session_code -> { claimed, assignmentId, expiresAt }

async function getSessionOwner(sessionCode) {
  const now = Date.now();
  const cached = sessionOwnerCache.get(sessionCode);
  if (cached && cached.expiresAt > now) return cached;

  const { data, error } = await supabase
    .from('profiles')
    .select('active_assignment_id, last_active_at')
    .eq('session_code', sessionCode)
    .maybeSingle();

  let owner;
  if (error) {
    owner = cached || { claimed: false, assignmentId: null };
  } else {
    const isPresent = !!data?.last_active_at
      && (now - new Date(data.last_active_at).getTime()) < PRESENCE_STALE_MS;
    owner = { claimed: !!data && isPresent, assignmentId: data ? data.active_assignment_id : null };
  }

  sessionOwnerCache.set(sessionCode, { ...owner, expiresAt: now + SESSION_OWNER_CACHE_TTL_MS });
  return owner;
}

// ── Supabase writes (fire-and-forget — no block the plugin response) ──────────
async function writeTelemetry(p) {
  // 1. Upsert the session record (lightweight, one row per session) so students
  //    can discover and claim it from "Conectar simulador" and the admin can
  //    see who is flying live — regardless of whether anyone has claimed it yet.
  await supabase
    .from('flight_sessions')
    .upsert(
      { session_code: p.sessionCode, last_seen: new Date().toISOString(), on_ground: p.onGround },
      { onConflict: 'session_code' }
    );

  // 2. Skip the heavy telemetry insert entirely if no logged-in student has
  //    claimed this session — avoids storing data for people who just have the
  //    plugin installed but aren't authenticated in the platform.
  const owner = await getSessionOwner(p.sessionCode);
  if (!owner.claimed) return;

  // 3. Insert the telemetry point.
  const { error } = await supabase
    .from('flight_telemetry')
    .insert({
      session_code:  p.sessionCode,
      flight_id:     p.flightId,
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

  if (error) throw error;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // ── POST /api/xplane/telemetry ────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/xplane/telemetry') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
        return;
      }

      if (!payload.sessionCode) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'sessionCode requerido' }));
        return;
      }

      if (!payload.flightId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'flightId requerido' }));
        return;
      }

      // Responder al plugin INMEDIATAMENTE (el plugin tiene timeout de 3s).
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      // Escribir a Supabase en background — si falla, solo se loguea.
      log(payload.sessionCode, payload);
      writeTelemetry(payload).catch(err =>
        console.error(`[Supabase] Error al escribir telemetría (${payload.sessionCode}):`, err.message)
      );
    });
    return;
  }

  // ── GET /health ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log('');
  console.log('  IFR Training — Receptor de Telemetría');
  console.log(`  Escuchando en  http://localhost:${PORT}`);
  console.log(`  Endpoint       POST /api/xplane/telemetry`);
  console.log(`  Supabase       ${SUPABASE_URL}`);
  console.log('');
  console.log('  Esperando datos de X-Plane...');
  console.log('');
});

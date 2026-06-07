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

// ── Supabase writes (fire-and-forget — no block the plugin response) ──────────
async function writeTelemetry(p) {
  // 1. Upsert the session record so the admin can see who is flying live.
  await supabase
    .from('flight_sessions')
    .upsert(
      { session_code: p.sessionCode, last_seen: new Date().toISOString(), on_ground: p.onGround },
      { onConflict: 'session_code' }
    );

  // 2. Insert the telemetry point.
  const { error } = await supabase
    .from('flight_telemetry')
    .insert({
      session_code:  p.sessionCode,
      flight_id:     p.flightId,
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

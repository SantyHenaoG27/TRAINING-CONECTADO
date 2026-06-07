import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Config ────────────────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
function log(sessionCode: string, data: any) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(
    `[${ts}] ${sessionCode.padEnd(10)} |` +
      ` Lat ${data.latitude.toFixed(4)}` +
      ` Lon ${data.longitude.toFixed(4)}` +
      ` Alt ${Math.round(data.altitudeFt).toString().padStart(6)}ft` +
      ` IAS ${Math.round(data.indicatedAirspeedKt)}kt` +
      ` HDG ${Math.round(data.headingDeg)}°` +
      (data.onGround ? " [GND]" : ""),
  );
}

// ── Supabase writes (fire-and-forget — no bloquea la respuesta al plugin) ─────
// deno-lint-ignore no-explicit-any
async function writeTelemetry(p: any) {
  // 1. Upsert el registro de sesión para que el admin vea quién está volando.
  await supabase
    .from("flight_sessions")
    .upsert(
      { session_code: p.sessionCode, last_seen: new Date().toISOString(), on_ground: p.onGround },
      { onConflict: "session_code" },
    );

  // 2. Insertar el punto de telemetría.
  const { error } = await supabase
    .from("flight_telemetry")
    .insert({
      session_code: p.sessionCode,
      flight_id: p.flightId,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude_ft: p.altitudeFt,
      heading_deg: p.headingDeg,
      ias_kt: p.indicatedAirspeedKt,
      gs_kt: p.groundSpeedKt,
      vs_fpm: p.verticalSpeedFpm,
      pitch_deg: p.pitchDeg,
      bank_deg: p.bankDeg,
      on_ground: p.onGround,
      sim_time: p.timestamp,
    });

  if (error) throw error;
}

// ── HTTP handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ ok: true, timestamp: new Date().toISOString() });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 404, headers: corsHeaders });
  }

  let payload: ReturnType<JSON["parse"]>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON inválido" }, 400);
  }

  if (!payload?.sessionCode) {
    return jsonResponse({ ok: false, error: "sessionCode requerido" }, 400);
  }

  if (!payload?.flightId) {
    return jsonResponse({ ok: false, error: "flightId requerido" }, 400);
  }

  log(payload.sessionCode, payload);

  // Responder al plugin INMEDIATAMENTE (tiene timeout de 3s) y escribir en
  // segundo plano — si falla, solo se loguea.
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase Edge Functions
  EdgeRuntime.waitUntil(
    writeTelemetry(payload).catch((err: Error) =>
      console.error(`[Supabase] Error al escribir telemetría (${payload.sessionCode}):`, err.message)
    ),
  );

  return jsonResponse({ ok: true });
});

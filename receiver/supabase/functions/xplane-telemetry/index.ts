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

// ── Caché de propiedad de sesión ──────────────────────────────────────────────
// flight_telemetry es de alto volumen (una fila por paquete), así que solo se
// persiste cuando un estudiante autenticado (a) reclamó esta sesión vía
// "Conectar simulador" (profiles.session_code) Y (b) tiene el panel abierto en
// este momento — evidenciado por un latido reciente en profiles.last_active_at.
// Cualquier otro caso (plugin corriendo sin reclamar, o reclamado pero con la
// página cerrada / sesión cerrada) desperdiciaría almacenamiento y no se guarda.
//
// El panel del estudiante manda un latido cada 15s (PRESENCE_HEARTBEAT_MS en
// student.html); PRESENCE_STALE_MS le da un par de latidos de margen antes de
// considerar que el estudiante "no está presente".
const SESSION_OWNER_CACHE_TTL_MS = 15000;
const PRESENCE_STALE_MS = 40000;

interface SessionOwner {
  claimed: boolean;
  studentId: string | null;
  assignmentId: string | null;
  expiresAt: number;
}

const sessionOwnerCache = new Map<string, SessionOwner>();

async function getSessionOwner(sessionCode: string): Promise<SessionOwner> {
  const now = Date.now();
  const cached = sessionOwnerCache.get(sessionCode);
  if (cached && cached.expiresAt > now) return cached;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, active_assignment_id, last_active_at")
    .eq("session_code", sessionCode)
    .maybeSingle();

  let owner: SessionOwner;
  if (error) {
    owner = cached ?? { claimed: false, studentId: null, assignmentId: null, expiresAt: 0 };
  } else {
    const isPresent = !!data?.last_active_at &&
      (now - new Date(data.last_active_at).getTime()) < PRESENCE_STALE_MS;
    owner = {
      claimed: !!data && isPresent,
      studentId: data ? data.id : null,
      assignmentId: data ? data.active_assignment_id : null,
      expiresAt: 0,
    };
  }

  owner.expiresAt = now + SESSION_OWNER_CACHE_TTL_MS;
  sessionOwnerCache.set(sessionCode, owner);
  return owner;
}

// ── Supabase writes (fire-and-forget — no bloquea la respuesta al plugin) ─────
// deno-lint-ignore no-explicit-any
async function writeTelemetry(p: any) {
  // 1. Upsert el registro de sesión (liviano) para que el estudiante pueda
  //    descubrirla y reclamarla, y el admin vea quién está volando en vivo —
  //    sin importar si alguien ya la reclamó.
  await supabase
    .from("flight_sessions")
    .upsert(
      { session_code: p.sessionCode, last_seen: new Date().toISOString(), on_ground: p.onGround },
      { onConflict: "session_code" },
    );

  // 2. Si nadie autenticado y presente reclamó esta sesión, no se guarda la
  //    telemetría — evita gastar almacenamiento en vuelos no atribuibles.
  const owner = await getSessionOwner(p.sessionCode);
  if (!owner.claimed) return;

  // 3. Insertar el punto de telemetría, ya con la asignación vinculada.
  const { error } = await supabase
    .from("flight_telemetry")
    .insert({
      session_code: p.sessionCode,
      flight_id: p.flightId,
      assignment_id: owner.assignmentId,
      student_id: owner.studentId,
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

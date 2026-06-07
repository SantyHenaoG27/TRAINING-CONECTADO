-- Add flight_id so individual flights can be reconstructed from the
-- continuous telemetry stream (a session can contain multiple flights).
alter table public.flight_telemetry
  add column if not exists flight_id text;

create index if not exists flight_telemetry_flight_id_idx
  on public.flight_telemetry (flight_id);

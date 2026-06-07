-- Surfaces the linked assignment_id (if any) in the per-flight summary so the
-- admin reports view can show which assignment a flight fulfilled.
-- Postgres won't let CREATE OR REPLACE change a function's return columns, so
-- the existing one must be dropped first.
drop function if exists public.flight_summaries();

create function public.flight_summaries()
returns table (
  flight_id text,
  session_code text,
  assignment_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  max_altitude_ft numeric,
  max_ias_kt numeric,
  point_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    flight_id,
    session_code,
    max(assignment_id::text)::uuid as assignment_id,
    min(sim_time) as started_at,
    max(sim_time) as ended_at,
    extract(epoch from (max(sim_time) - min(sim_time))) as duration_seconds,
    max(altitude_ft) as max_altitude_ft,
    max(ias_kt) as max_ias_kt,
    count(*) as point_count
  from flight_telemetry
  where flight_id is not null
  group by flight_id, session_code
  order by min(sim_time) desc;
$$;

grant execute on function public.flight_summaries() to authenticated;

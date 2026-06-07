-- session_code is mutable (a student can re-link to a different simulator), so
-- matching admin reports to a student by "current profiles.session_code" breaks
-- as soon as the student switches equipment — historic flights then show up as
-- "sin estudiante asignado". Instead, stamp the student's id on each telemetry
-- row at write time (the receiver already resolves the owning profile to decide
-- whether to persist the row at all), giving a permanent, unambiguous link.
alter table public.flight_telemetry
  add column if not exists student_id uuid references public.profiles(id) on delete set null;

create index if not exists flight_telemetry_student_id_idx
  on public.flight_telemetry (student_id);

-- Surface student_id in the per-flight summary alongside assignment_id.
drop function if exists public.flight_summaries();

create function public.flight_summaries()
returns table (
  flight_id text,
  session_code text,
  assignment_id uuid,
  student_id uuid,
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
    max(student_id::text)::uuid as student_id,
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

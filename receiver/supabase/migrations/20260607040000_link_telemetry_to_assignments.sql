-- Lets a student pick which assigned flight they're about to fly, and stamps
-- that choice onto the telemetry stream so reports can be traced back to the
-- assignment that originated them.

alter table public.profiles
  add column if not exists active_assignment_id uuid references public.flight_assignments(id) on delete set null;

alter table public.flight_telemetry
  add column if not exists assignment_id uuid references public.flight_assignments(id) on delete set null;

create index if not exists flight_telemetry_assignment_id_idx
  on public.flight_telemetry (assignment_id);

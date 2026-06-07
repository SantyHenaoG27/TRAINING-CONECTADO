-- Each "vuelo asignado" the instructor creates becomes one row per student in
-- flight_assignments (so per-student status can be tracked independently), but
-- the admin UI needs to treat all rows created together as a single assignment
-- — to list it once, open it, see everyone it was sent to, add more students,
-- and edit its shared route/notes/deadline in one place.
--
-- assignment_group_id is that shared identifier: the client generates one UUID
-- per "Asignar vuelo" submission and stamps it on every row in the batch (and
-- reuses the same id later when adding more students to that assignment).
alter table public.flight_assignments
  add column if not exists assignment_group_id uuid;

-- Backfill existing rows: group by the fields that are identical across a
-- single submission (multi-row inserts share the same created_at timestamp).
with groups as (
  select distinct instructor_id, origen, destino, fecha_limite, instrucciones, created_at,
         gen_random_uuid() as gid
  from public.flight_assignments
  where assignment_group_id is null
)
update public.flight_assignments fa
set assignment_group_id = g.gid
from groups g
where fa.assignment_group_id is null
  and fa.instructor_id = g.instructor_id
  and fa.origen = g.origen
  and fa.destino = g.destino
  and fa.fecha_limite is not distinct from g.fecha_limite
  and fa.instrucciones is not distinct from g.instrucciones
  and fa.created_at = g.created_at;

alter table public.flight_assignments
  alter column assignment_group_id set not null,
  alter column assignment_group_id set default gen_random_uuid();

create index if not exists flight_assignments_group_id_idx
  on public.flight_assignments (assignment_group_id);

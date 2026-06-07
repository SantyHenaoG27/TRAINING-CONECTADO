-- El estudiante solo podía LEER sus asignaciones (política "estudiante ve sus
-- vuelos"); no había ninguna política de UPDATE para su rol, así que marcar un
-- vuelo como "completado" desde el panel del estudiante quedaba bloqueado en
-- silencio por RLS (0 filas afectadas, sin error). Esta política le permite
-- actualizar sus propias filas — usado hoy para cambiar `estado` (incluyendo
-- volver a "pendiente" si decide repetir el vuelo).
create policy "estudiante actualiza sus vuelos asignados"
  on public.flight_assignments
  for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

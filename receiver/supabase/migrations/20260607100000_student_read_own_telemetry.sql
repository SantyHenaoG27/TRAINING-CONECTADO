-- Allows the student history panel to reconstruct only the authenticated
-- student's own flights. Rows recorded after 2026-06-07 use student_id; older
-- rows can still be recovered through the student's current session_code.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'flight_telemetry'
      and policyname = 'estudiante lee su propia telemetria'
  ) then
    create policy "estudiante lee su propia telemetria"
      on public.flight_telemetry
      for select
      to authenticated
      using (
        student_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.session_code is not null
            and p.session_code = flight_telemetry.session_code
            and flight_telemetry.student_id is null
        )
      );
  end if;
end $$;

-- Legacy telemetry without flight_id cannot be mapped to an explicit flight
-- lifecycle. Reports now require flight_id, so discard pre-flight_id rows.
delete from public.flight_telemetry
where flight_id is null or btrim(flight_id) = '';

alter table public.flight_telemetry
  alter column flight_id set not null;

alter table public.flight_telemetry
  add constraint flight_telemetry_flight_id_not_blank
  check (btrim(flight_id) <> '');

-- Tracks whether a student currently has the panel open and is authenticated.
-- The student page heartbeats this column while open; the receiver only
-- persists telemetry when the owning profile's presence is fresh, so flights
-- made without the page open / logged in are not stored.
alter table public.profiles
  add column if not exists last_active_at timestamptz;

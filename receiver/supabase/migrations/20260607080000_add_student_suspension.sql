-- Backs the "Suspender / Reactivar" action on the admin's student management
-- page: a suspended student keeps their account and history, but is blocked
-- from entering the student panel (enforced in auth-guard.js).
alter table public.profiles
  add column if not exists suspended boolean not null default false;

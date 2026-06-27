-- Allow authenticated users to read flight_sessions (needed for "Conectar simulador")
-- The edge function uses service_role for inserts/upserts, bypassing RLS.
-- Students need SELECT to discover active simulator sessions on the network.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'flight_sessions'
      AND policyname = 'authenticated can read flight_sessions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "authenticated can read flight_sessions"
      ON public.flight_sessions
      FOR SELECT
      TO authenticated
      USING (true)
    $policy$;
  END IF;
END $$;

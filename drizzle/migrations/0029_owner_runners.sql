CREATE TABLE public.owner_runners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key_id text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Oracle server',
  endpoint text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  status text NOT NULL DEFAULT 'online',
  capacity jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, DELETE ON public.owner_runners TO authenticated;
GRANT ALL ON public.owner_runners TO service_role;
ALTER TABLE public.owner_runners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read their runner" ON public.owner_runners FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owners remove their runner" ON public.owner_runners FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE SELECT (ciphertext, iv) ON public.owner_runners FROM authenticated;
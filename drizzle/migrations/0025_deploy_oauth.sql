ALTER TABLE public.provider_credentials
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'token',
  ADD COLUMN IF NOT EXISTS refresh_ciphertext text,
  ADD COLUMN IF NOT EXISTS refresh_iv text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.deploy_oauth_states (
  state_digest text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('vercel', 'supabase')),
  verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.deploy_oauth_states FROM anon, authenticated;
GRANT ALL ON public.deploy_oauth_states TO service_role;
ALTER TABLE public.deploy_oauth_states ENABLE ROW LEVEL SECURITY;
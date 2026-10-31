CREATE TABLE public.preview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  run_id uuid,
  sandbox_id text NOT NULL,
  branch_name text NOT NULL,
  port integer NOT NULL,
  framework text NOT NULL DEFAULT 'unknown',
  command text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'starting',
  preview_url text NOT NULL DEFAULT '',
  process jsonb NOT NULL DEFAULT '{}'::jsonb,
  browser_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_version integer NOT NULL DEFAULT 1,
  share_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  last_health_check_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preview_sessions TO authenticated;
GRANT ALL ON public.preview_sessions TO service_role;
ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own previews" ON public.preview_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX preview_sessions_project_idx ON public.preview_sessions (project_id, created_at DESC);
CREATE INDEX preview_sessions_active_idx ON public.preview_sessions (status, expires_at);

-- Gateway-only upstream details (internal sandbox host + encrypted traffic token). No client access.
CREATE TABLE public.preview_secrets (
  preview_id uuid PRIMARY KEY REFERENCES public.preview_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  upstream_host text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.preview_secrets TO service_role;
ALTER TABLE public.preview_secrets ENABLE ROW LEVEL SECURITY;
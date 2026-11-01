CREATE TABLE public.run_resume_secrets (
  session_id uuid PRIMARY KEY REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.run_resume_secrets TO service_role;
ALTER TABLE public.run_resume_secrets ENABLE ROW LEVEL SECURITY;
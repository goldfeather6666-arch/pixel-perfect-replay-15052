CREATE TABLE public.task_deployment_settings (
  task_id uuid PRIMARY KEY REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  project_ref text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.task_deployment_settings TO service_role;
REVOKE ALL ON public.task_deployment_settings FROM anon, authenticated;
ALTER TABLE public.task_deployment_settings ENABLE ROW LEVEL SECURITY;
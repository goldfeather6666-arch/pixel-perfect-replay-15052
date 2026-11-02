CREATE TABLE public.task_domain_setups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, vercel_project_id text NOT NULL, vercel_account_id uuid NOT NULL, database_ref text, database_account_id uuid, domain text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','configured')), sync_error text, approved_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id, vercel_project_id)
);
GRANT ALL ON public.task_domain_setups TO service_role;
REVOKE ALL ON public.task_domain_setups FROM anon, authenticated;
ALTER TABLE public.task_domain_setups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.task_secret_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL, vercel_project_id text NOT NULL, vercel_account_id uuid NOT NULL, name text NOT NULL CHECK (name ~ '^[A-Z_][A-Z0-9_]{0,127}$'), purpose text NOT NULL, source_url text NOT NULL, targets text[] NOT NULL DEFAULT ARRAY['production'], state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','saving','synced','failed','cancelled')), ciphertext text, iv text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id, vercel_project_id, name)
);
GRANT ALL ON public.task_secret_requests TO service_role;
REVOKE ALL ON public.task_secret_requests FROM anon, authenticated;
ALTER TABLE public.task_secret_requests ENABLE ROW LEVEL SECURITY;
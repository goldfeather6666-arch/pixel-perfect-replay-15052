ALTER TABLE public.agent_sessions
  ADD COLUMN IF NOT EXISTS supabase_ref text,
  ADD COLUMN IF NOT EXISTS vercel_project_id text,
  ADD COLUMN IF NOT EXISTS applied_migrations text[] NOT NULL DEFAULT '{}';
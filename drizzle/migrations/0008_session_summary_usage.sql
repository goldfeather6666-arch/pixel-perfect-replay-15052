ALTER TABLE public.agent_sessions ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.agent_sessions ADD COLUMN IF NOT EXISTS summarized_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.agent_sessions ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{"input":0,"output":0}'::jsonb;
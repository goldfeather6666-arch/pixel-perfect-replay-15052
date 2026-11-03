-- Style memory: the design language an owner has already used, so later builds match it.
CREATE TABLE public.style_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  repo text NOT NULL DEFAULT '',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, repo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.style_memory TO authenticated;
GRANT ALL ON public.style_memory TO service_role;

ALTER TABLE public.style_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own style memory" ON public.style_memory
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own style memory" ON public.style_memory
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own style memory" ON public.style_memory
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own style memory" ON public.style_memory
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX style_memory_user_idx ON public.style_memory (user_id, updated_at DESC);
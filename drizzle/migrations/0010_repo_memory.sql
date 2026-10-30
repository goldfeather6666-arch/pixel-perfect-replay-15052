CREATE TABLE public.repo_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  repo text NOT NULL,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, repo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_memory TO authenticated;
GRANT ALL ON public.repo_memory TO service_role;
ALTER TABLE public.repo_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repo memory select" ON public.repo_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own repo memory insert" ON public.repo_memory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own repo memory update" ON public.repo_memory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own repo memory delete" ON public.repo_memory FOR DELETE TO authenticated USING (auth.uid() = user_id);
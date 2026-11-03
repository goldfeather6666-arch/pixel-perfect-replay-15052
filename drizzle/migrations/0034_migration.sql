CREATE TABLE public.repo_symbol_index (
  user_id uuid NOT NULL,
  repo text NOT NULL,
  path text NOT NULL,
  content_hash text NOT NULL,
  symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  imports jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, repo, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_symbol_index TO authenticated;
GRANT ALL ON public.repo_symbol_index TO service_role;
ALTER TABLE public.repo_symbol_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their symbol index" ON public.repo_symbol_index FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX repo_symbol_index_symbols_idx ON public.repo_symbol_index USING gin (symbols jsonb_path_ops);
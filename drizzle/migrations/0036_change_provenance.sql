CREATE TABLE public.change_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  run_id uuid,
  path text NOT NULL,
  tool text NOT NULL DEFAULT 'write_file',
  action text NOT NULL DEFAULT 'write',
  prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.change_provenance TO authenticated;
GRANT ALL ON public.change_provenance TO service_role;
ALTER TABLE public.change_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their change provenance" ON public.change_provenance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners append their change provenance" ON public.change_provenance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX change_provenance_session_path_idx ON public.change_provenance (session_id, path, created_at DESC);
CREATE INDEX change_provenance_run_idx ON public.change_provenance (run_id);
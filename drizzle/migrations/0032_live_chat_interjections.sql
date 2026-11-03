CREATE TABLE public.session_interjections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
GRANT SELECT, INSERT ON public.session_interjections TO authenticated;
GRANT ALL ON public.session_interjections TO service_role;
ALTER TABLE public.session_interjections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interjections read" ON public.session_interjections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own interjections insert" ON public.session_interjections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE INDEX session_interjections_pending ON public.session_interjections(session_id) WHERE consumed_at IS NULL;
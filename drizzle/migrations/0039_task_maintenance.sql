CREATE TABLE public.task_maintenance (
 session_id uuid PRIMARY KEY REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 last_scanned_at timestamptz,
 report jsonb NOT NULL DEFAULT '[]'::jsonb,
 dismissed text[] NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE ON public.task_maintenance TO authenticated;
GRANT ALL ON public.task_maintenance TO service_role;
ALTER TABLE public.task_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read maintenance" ON public.task_maintenance FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create maintenance" ON public.task_maintenance FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Owners update maintenance" ON public.task_maintenance FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
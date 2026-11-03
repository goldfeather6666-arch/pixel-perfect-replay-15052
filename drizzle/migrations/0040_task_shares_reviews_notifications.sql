CREATE TABLE public.task_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 in_gallery boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.task_shares TO authenticated;
GRANT ALL ON public.task_shares TO service_role;
ALTER TABLE public.task_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read shares" ON public.task_shares FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create shares" ON public.task_shares FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Owners update shares" ON public.task_shares FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.change_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 verdict text NOT NULL CHECK (verdict IN ('approved','changes_requested')),
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.change_reviews TO authenticated;
GRANT ALL ON public.change_reviews TO service_role;
ALTER TABLE public.change_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read reviews" ON public.change_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create reviews" ON public.change_reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE TABLE public.notification_settings (
 user_id uuid PRIMARY KEY,
 webhook_url text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read notify" ON public.notification_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners create notify" ON public.notification_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners update notify" ON public.notification_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
ALTER TABLE public.mcp_connections ADD COLUMN transport_mode text NOT NULL DEFAULT 'http' CHECK (transport_mode IN ('http', 'sse'));
COMMENT ON COLUMN public.mcp_connections.transport IS 'DEPRECATED: replaced by transport_mode to support SSE without changing the existing HTTP constraint';
ALTER TABLE public.mcp_connections ADD COLUMN allow_actions boolean NOT NULL DEFAULT false;
CREATE TABLE public.mcp_action_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES public.mcp_connections(id) ON DELETE CASCADE,
 server_name text NOT NULL,
 server_url text NOT NULL,
 transport_mode text NOT NULL CHECK (transport_mode IN ('http','sse')),
 tool_name text NOT NULL,
 input_schema jsonb NOT NULL,
 arguments jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','executing','succeeded','failed','rejected')),
 result text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
GRANT SELECT, INSERT ON public.mcp_action_requests TO authenticated;
GRANT ALL ON public.mcp_action_requests TO service_role;
ALTER TABLE public.mcp_action_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read external actions" ON public.mcp_action_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners stage external actions" ON public.mcp_action_requests FOR INSERT TO authenticated WITH CHECK (
 user_id = auth.uid() AND state = 'pending' AND result IS NULL
 AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
 AND EXISTS (SELECT 1 FROM public.mcp_connections c WHERE c.id = connection_id AND c.user_id = auth.uid() AND c.enabled AND c.allow_actions)
);
CREATE INDEX mcp_action_requests_owner_session ON public.mcp_action_requests(user_id, session_id, created_at);
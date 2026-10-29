CREATE TABLE public.mcp_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
 url text NOT NULL,
 transport text NOT NULL DEFAULT 'http' CHECK (transport = 'http'),
 state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'failed')),
 enabled boolean NOT NULL DEFAULT true,
 ciphertext text,
 iv text,
 tool_names jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((ciphertext IS NULL) = (iv IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_connections TO authenticated;
GRANT ALL ON public.mcp_connections TO service_role;
ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON public.mcp_connections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX mcp_connections_user_idx ON public.mcp_connections(user_id);
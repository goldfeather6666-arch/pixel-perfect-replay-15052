ALTER TABLE public.mcp_connections ADD COLUMN auth_mode text NOT NULL DEFAULT 'token' CHECK (auth_mode IN ('token','oauth'));
ALTER TABLE public.mcp_connections ADD COLUMN oauth_status text NOT NULL DEFAULT 'none' CHECK (oauth_status IN ('none','authenticating','ready','failed'));
CREATE TABLE public.mcp_oauth_credentials (
 connection_id uuid PRIMARY KEY REFERENCES public.mcp_connections(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 ciphertext text NOT NULL,
 iv text NOT NULL,
 flow_digest text,
 flow_expires_at timestamptz,
 flow_claimed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mcp_oauth_credentials TO service_role;
ALTER TABLE public.mcp_oauth_credentials ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.mcp_oauth_credentials IS 'Server-only encrypted OAuth tokens, client registration, PKCE verifier and authorization-server pin; no browser Data API access';
CREATE INDEX mcp_oauth_credentials_owner ON public.mcp_oauth_credentials(user_id);
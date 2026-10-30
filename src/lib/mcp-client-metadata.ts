export function mcpClientMetadata(origin: string) {
  return { client_id: `${origin}/api/public/oauth-client`, client_name: "Forge", client_uri: origin,
    redirect_uris: [`${origin}/mcp/callback`], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
}
/** Values stay server-side; only this list of variable names belongs in source control. */
export function deploymentEnv(url: string, publicKey: string, serviceRoleKey?: string) {
  const vars: Record<string, string> = {
    SUPABASE_URL: url, SUPABASE_ANON_KEY: publicKey, SUPABASE_PUBLISHABLE_KEY: publicKey,
    NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: publicKey, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
  };
  if (serviceRoleKey) vars.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  return vars;
}

export function deploymentTemplate() {
  return "# Values are configured in Vercel, never committed here.\n" +
    Object.keys(deploymentEnv("", "", "server-only")).map((name) => `${name}=`).join("\n") + "\n";
}
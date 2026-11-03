/** Deep links that open the exact token-creation page, prefilled where the provider allows it.
 *  Only services without one-click sign-in belong here: the database connects by signing in with Supabase. */
export const TOKEN_LINKS = {
  github: {
    url: "https://github.com/settings/tokens/new?scopes=repo,workflow,read:user,user:email&description=Forge",
    steps: "Scopes are pre-selected. Set an expiry, click Generate token, copy it and paste below.",
  },
  vercel: {
    url: "https://vercel.com/account/settings/tokens",
    steps: "Click Create, name it Forge, choose scope Full Account, copy the token and paste below.",
  },
} as const;

export type TokenLinkProvider = keyof typeof TOKEN_LINKS;
export const hasTokenLink = (p: string): p is TokenLinkProvider => p in TOKEN_LINKS;

import { routeModel } from './engine/reasoning';
export const AI_CONNECTION_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'compatible'] as const;
export function aiConnection(provider: string): boolean { return (AI_CONNECTION_PROVIDERS as readonly string[]).includes(provider); }
export type TeamModels = {
 credential_id: string | null; model: string;
 coding_credential_id?: string | null; coding_model?: string | null;
 reviewer_credential_id?: string | null; reviewer_model?: string | null;
};
export function teamBinding(role: string, s: TeamModels) {
 const routed = routeModel(role, { master:s.model, coding:s.coding_model ?? null, reviewer:s.reviewer_model ?? null, fallback:null });
 const review = role === 'reviewer' || role === 'security';
 const coding = ['coder','frontend','backend','database','integration','tester','qa','debugger'].includes(role);
 const pin = review ? s.reviewer_credential_id : coding ? s.coding_credential_id : null;
 const override = review ? s.reviewer_model : coding ? s.coding_model : s.model;
 if (pin && !override?.trim()) throw new Error(`Choose a model for the ${review ? 'review' : 'coding'} API connection.`);
 const credentialId = pin ?? s.credential_id;
 if (!credentialId) throw new Error('Lead API connection missing');
 return { credentialId, model:routed.model, reason: pin ? `${routed.reason}; separate API connection` : routed.reason };
}

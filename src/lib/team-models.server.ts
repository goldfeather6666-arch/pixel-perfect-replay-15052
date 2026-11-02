import { aiConnection, teamBinding, type TeamModels } from './team-models';
import { decryptSecret } from './crypto.server';
import { assertPublicEndpoint, createModel } from './providers.server';
import { modelConfigurationError } from './provider-request-error';

/** Resolve all task-pinned AI connections before any work; no alternate-account fallback. */
export async function loadTeamModels(sb: any, userId: string, session: TeamModels) {
 const bindings = ['master','coder','reviewer'].map(role => teamBinding(role, session));
 const ids = [...new Set(bindings.map(b => b.credentialId))];
 const connections = await Promise.all(ids.map(async id => {
  const {data:row,error} = await sb.from('provider_credentials').select('*').eq('id',id).eq('user_id',userId).maybeSingle();
  if (error || !row || !aiConnection(row.provider)) throw new Error('A selected team AI connection is missing or unavailable. Reselect it in AI team settings.');
  if (row.provider === 'compatible') {
   if (!row.base_url) throw new Error('Selected custom AI connection has no endpoint');
   await assertPublicEndpoint(row.base_url);
  }
  const key = await decryptSecret(row.ciphertext,row.iv);
  return {id,row,key};
 }));
 const byId = new Map(connections.map(c => [c.id,c]));
 for (const b of bindings) {
  const c = byId.get(b.credentialId);
  if (!c) throw new Error('Selected AI connection unavailable');
  const error = modelConfigurationError(c.row.base_url,b.model);
  if (error) throw new Error(error);
 }
 return (role: string) => {
  const b = teamBinding(role,session);
  const c = byId.get(b.credentialId);
  if (!c) throw new Error('Selected AI connection unavailable');
  return {model:createModel(c.row.provider,c.key,c.row.base_url,b.model,c.row.extra_body ?? null),id:b.model,provider:c.row.provider as string,reason:b.reason};
 };
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { domainName, secretRequestInput, type SecretRequestSummary } from "./project-setup";

const task = z.object({ taskId: z.string().uuid() });
export const addCustomDomain = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(task.extend({ domain: domainName })).handler(async ({ data, context }) => {
    const { addProjectDomain } = await import("./project-setup.server");
    return addProjectDomain(context, data.taskId, data.domain);
  });
/** POST may verify ownership and apply the setup explicitly approved when adding this domain. */
export const checkCustomDomain = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(task).handler(async ({ data, context }) => {
    const { checkProjectDomain } = await import("./project-setup.server");
    return checkProjectDomain(context, data.taskId);
  });
export const createSecretRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(task.extend({ request: secretRequestInput })).handler(async ({ data, context }) => {
    const { requestProjectSecret } = await import("./project-setup.server");
    return requestProjectSecret(context, data.taskId, data.request);
  });
export const listSecretRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(task).handler(async ({ data, context }): Promise<SecretRequestSummary[]> => {
    const { listProjectSecrets } = await import("./project-setup.server");
    return listProjectSecrets(context, data.taskId);
  });
export const submitSecretRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(task.extend({ requestId: z.string().uuid(), value: z.string().min(1).max(24576) })).handler(async ({ data, context }) => {
    const { submitProjectSecret } = await import("./project-setup.server");
    return submitProjectSecret(context, data.taskId, data.requestId, data.value);
  });
export const cancelSecretRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(task.extend({ requestId: z.string().uuid() })).handler(async ({ data, context }) => {
    const { cancelProjectSecret } = await import("./project-setup.server");
    return cancelProjectSecret(context, data.taskId, data.requestId);
  });
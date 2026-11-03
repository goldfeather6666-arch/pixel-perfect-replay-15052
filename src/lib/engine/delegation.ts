// Delegation contracts (handbook §14). Built by the master for every specialist job.
import { WRITER_ROLES, CHECKER_ROLES, type SpecialistRole } from "../agent-team";

export type DelegationContract = {
  subtask_id: string; objective: string; role: SpecialistRole;
  owned_paths: string[]; read_only_paths: string[]; dependencies: string[];
  deliverables: string[]; acceptance_criteria: string[]; tools: string[];
  budget: { max_steps: number; timeout_seconds: number };
  cannot: string[];
};

export const UNIVERSAL_CANNOT = ["merge", "deploy", "change credentials", "approve own high-risk operation", "delegate", "touch paths outside owned_paths"] as const;

export function contractFor(job: { label: string; role: SpecialistRole; task: string; paths: string[]; after: string[] }, i: number, steps: number): DelegationContract {
  const writer = WRITER_ROLES.includes(job.role), checker = CHECKER_ROLES.includes(job.role);
  return {
    subtask_id: `worker-${String(i + 1).padStart(2, "0")}`,
    objective: job.task.slice(0, 400),
    role: job.role,
    owned_paths: writer ? job.paths : [],
    read_only_paths: writer ? [] : job.paths,
    dependencies: job.after,
    deliverables: writer ? ["complete file proposals for owned paths", "worker report"] : checker ? ["exact command output", "worker report"] : ["findings with file:line evidence", "worker report"],
    acceptance_criteria: ["every claim cites evidence (file:line or exact output)", "no work outside owned_paths", "unrun checks reported as unverified"],
    tools: writer ? ["read", "search", "propose_file"] : checker ? ["read", "search", "run_command"] : ["read", "search"],
    budget: { max_steps: steps, timeout_seconds: 900 },
    cannot: [...UNIVERSAL_CANNOT, ...(writer ? [] : ["write files"]), ...(checker ? [] : ["run commands"])],
  };
}

/** Exclusive ownership: no two writers in the same wave may own the same path. */
export function ownershipConflicts(contracts: DelegationContract[], waves: number[][]): string[] {
  const out: string[] = [];
  for (const wave of waves) {
    const seen = new Map<string, string>();
    for (const i of wave) {
      const c = contracts[i]; if (!c) continue;
      for (const p of c.owned_paths) {
        const prev = seen.get(p);
        if (prev) out.push(`${p} owned by both ${prev} and ${c.subtask_id}`);
        else seen.set(p, c.subtask_id);
      }
    }
  }
  return out;
}

export const contractText = (c: DelegationContract) => `DELEGATION CONTRACT (binding; the master is the only integrator)\n${JSON.stringify(c, null, 2)}`;

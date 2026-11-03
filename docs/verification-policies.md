# Verification policies

Forge supports an optional `forge.policy.json` at the repository root. It tightens the existing production preflight; it does not run commands by itself or grant permission to publish, migrate, share, or change infrastructure.

```json
{
  "version": 1,
  "requiredChecks": ["lint", "typecheck", "test", "build"]
}
```

Allowed names are `lint`, `typecheck`, `test`, `build`, `e2e`, `a11y`, and `lighthouse`. Existing `type-check` and `check-types` scripts count as type checking; `test:e2e` and `test:a11y` count toward their corresponding requirements. Arbitrary commands, unknown options, unsupported versions, and empty requirements are rejected. An absent file preserves existing behavior.

The owner commits the policy through the normal file approval workflow, then requests production checks. A required script must actually execute and exit successfully. Missing scripts, interrupted steps, nonzero exits, and invalid policy block verification. No external prerequisite is required to activate these checks.

## Performance budgets

`budget.json` supports `jsKb`, `cssKb`, `totalKb`, `lcpMs`, and `cls`. Static payload values represent uncompressed JavaScript and CSS build bytes divided by 1024, not network transfer sizes. No discovered assets means no payload evidence, not a zero-byte build. Browser metrics require measured browser evidence; the current static-build preflight cannot measure LCP or CLS, so declaring them blocks verification as unmeasured until that evidence is available.

## History and limitations

Changes → Verification history reads the owner's persisted budget and policy milestones and shows the exact measured commit, app root, time, limits, and available measurements. Older events without measurements or commit identity remain unverified. A revision change during measurement invalidates that result. Cached successful checks do not create a second fabricated measurement.

Verification: 629 automated tests passed; the signed-in task history loaded successfully on desktop and at 559px width with no page errors or horizontal overflow. That task had no budget/policy milestones, so populated history and a customer preflight with committed policy have not yet been verified end-to-end. No customer builds, external writes, or production releases were started for this check.
# Project State

Project memory for the ADO Task & Worktree Manager. Decisions log (AD-NNN) +
Handoff snapshot.

## Decisions

| ID     | Date       | Decision | Rationale |
| ------ | ---------- | -------- | --------- |
| AD-001 | 2026-06-28 | A technical-debt remediation batch was opened from a repo audit. Five items registered as features and attacked in sequence: `ci-pr-gate` (#1) → `agent-form-stable-key` (#2) → `app-hooks-extraction` (#3) → `ado-fetch-timeout` (#9) → `coverage-reporting` (#12). | Audit found localized, actionable debt; sequencing front-loads the safety net (CI gate) before the behavioral fixes and refactor. |
| AD-002 | 2026-06-28 | ~~The PR quality gate (`ci-pr-gate`) runs on **ubuntu-latest**.~~ **REVERSED by AD-005.** | The gate only runs typecheck/lint/test; unit tests were assumed OS-independent. The assumption was wrong (see AD-005). |
| AD-003 | 2026-06-28 | Test coverage (`coverage-reporting`) is **report-only** — `@vitest/coverage-v8` + a `test:coverage` script, printed in CI, with **no failing threshold gate**. | Establish a baseline first; a blocking threshold can be layered on later once the real coverage numbers are known. |
| AD-004 | 2026-06-28 | The `App.tsx` god-component refactor (`app-hooks-extraction`) is **incremental** — extract `useSessions` + `useTree` now; `useTasks`/`useConfig` deferred. | Smaller, lower-risk PR; the renderer has no unit tests by convention, so the extracted hooks become the first testable seam. |
| AD-006 | 2026-07-03 | The **Workflows** epic (issue #56 PRD) is specified **milestone-by-milestone, WF1 first**. WF1 (headless-agent spike) is spec'd and will be executed before WF2–WF5 are spec'd. Also decided: ADO **child-task fetching** (net-new `$expand=Relations` gateway surface) is **in v1 scope** (lands in WF2). | The PRD itself calls WF1 a throwaway de-risk spike whose exact Claude Code flags are unverified; WF3/WF4 ACs depend entirely on what WF1 pins. Writing testable ACs for the agent step before the spike runs would fabricate outcomes. Child-task fetching doesn't exist today (`getWorkItems` is flat-fields only) but the "implement ticket" example (US 38) needs it. |
| AD-005 | 2026-06-28 | The PR gate runs on **windows-latest**, reversing AD-002. | First CI run (PR #57) failed: `worktree-manager.test.ts` asserts Windows backslash paths because the production code normalizes paths to backslashes — the app is Windows-only (only `--win` is ever built). The real-git suite is OS-coupled (`expected "/tmp/.../repo"` vs `received "\tmp\...\repo"`, plus `spawn git ENOENT`) and is green only on Windows. Making it OS-portable would be a large change to Windows-only code with no benefit. Matches release/nightly. |
| AD-007 | 2026-07-03 | The headless agent process is spawned **directly** — `shell:false`, argv array passed verbatim, child **stdin closed** (`stdio:['ignore','pipe','pipe']`). **NOT** via a shell, and **NOT** as a `.cmd` shim needing `shell:true` — this corrects the ".cmd shim" assumption in WF1's spec/design. Binds WF3's `agent-command-builder` / `agent-step-runner`. | WF1-T7 empirical finding (`claude` 2.1.199): the installed CLI is a native `.exe` (`~/.local/bin/claude.exe`). Under `shell:true` on Windows, cmd re-parses and corrupts inline JSON args (`--json-schema is not valid JSON: Unterminated string`), so `--json-schema`/`--mcp-config` must reach the exe **unquoted-by-a-shell**; a direct spawn keeps the argv intact and no config file is needed. Headless also blocks ~3s on stdin unless it is closed. Full evidence: `features/workflows-headless-agent-spike/findings.md`. |
| AD-010 | 2026-07-06 | **WF4 (Blocker + resume) scope pinned via 3 owner decisions + the design's pause architecture:** (1) **Engine auto-pauses + resumes** inside `ctx.agent` on a `blocked` agent result — the author writes no pause/resume code; `ctx.agent` resolves `done` after any number of guidance rounds, or the run cancels on abort. `ctx.ask({title,body})` is the standalone human-in-the-loop primitive that path reuses. (2) **`abort` → run ends `cancelled`** (reuse the terminal status; no new status). (3) **Native lifecycle toasts on block/finish/fail**, cancel silent (`ctx.notify({toast})` stays independent). **Architecture:** the block-loop lives in the DI'd `AgentStepRunner` via an injected `onBlocked` resolver (Approach A — keeps `ctx` thin, mirrors WF3); ONE manager-owned pause primitive (`runtime.requestInput` + `#pendingRespond`) funnels both `ctx.ask` and the agent `onBlocked`; `respond` **always** transitions `blocked→running` (resumed) and hands the decision to the caller — the `abort→cancelled` outcome is produced by the agent consumer throwing `CancellationError`, NOT a reducer edge (so the reducer adds only `blocked`/`resumed` + a `blocked→cancelled` guard for cancel-while-blocked). | Owner chose engine-driven auto-pause for "supervise by exception" (US 38) with zero author plumbing; `cancelled` reuse avoids widening `RunStatus` beyond `blocked`; toasts match US 22. Approach A matches the project's DI-orchestrator-tested-via-fakes convention and WF3's own Approach A. Spec/design/tasks: `.specs/features/workflows-blocker-resume/` (WF4-01..20). |
| AD-012 | 2026-07-06 | **WF5 gets a hi-fi rebuild slice (`workflows-ui-hifi`) that AMENDS AD-011.** The authoritative visual spec is `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md` (hifi) — it was **missed during the original WF5 Design** (process error; the delivered timeline was low-fidelity). Two AD-011 decisions are **reversed** by the handoff: (1) a **failed run now shows a failed footer** with the failing call + `error/stdout/code` (was "status only"); (2) the **live event stream is enriched** (was "minimal"): steps gain a semantic `stepKind` + `stepId` + a `step-finished {durationMs}` event, agent steps carry `{prompt, permission}` on start and `{status, data, sessionId}` on finish, failures are broadcast, and a new `workflow:run-started {runId, workflowId, input, startedAt}` event seeds the header/INPUTS strip (also retiring WF5's `pendingWf` runId hack). AD-011 decision 3 (scaffold+reveal) stands. Scope: `.specs/features/workflows-ui-hifi/spec.md` — 24 ACs (WHF-01..24); WHF-01..10 backend/unit-tested, WHF-11..24 renderer/hand-verified. Same branch `feature/workflows-ui`. **Spec APPROVED; Design next (fresh session).** | The handoff is the source of truth for visual fidelity (PRD = behavior); the AD-011 options were chosen without it on the table. The hifi timeline (kind tags, durations, agent detail boxes, step detail boxes, failed footer) genuinely requires data the merged WF2/WF3 event surface never carried — so a backend enrichment (unit-tested) rides alongside the renderer rebuild. Lesson saved: always read `design/handoff/` before UI design. |
| AD-011 | 2026-07-06 | ~~**WF5 (Workflows UI) scope pinned via 3 owner decisions**~~ **(decisions 1 & 2 AMENDED by AD-012; decision 3 stands):** (1) **Run state is live-stream only** — the view accumulates `workflow:*` events in an always-App-mounted `useWorkflowRuns` hook (survives direction switches); NO read channel for persisted/past runs (v2). (2) **A failed run shows only its `failed` status** in the UI — `error`/`stdout`/`code` are captured server-side but not broadcast (deferred). (3) **"New workflow" = scaffold + reveal** via a NEW `workflows:scaffold` channel; the created folder is revealed **main-side** with `shell.showItemInFolder` (no editor coupling). **Architecture:** the fold logic is a pure, unit-tested `workflow-run-view.ts` (like `tree-selection`); only `workflow-run-view` + `workflow-scaffold` carry unit tests, the rest (view, dialogs, hook wiring, handler) is hand-verified per project UI convention. 10 tasks / 3 phases (inline). | Owner chose live-only to match the PRD's v1-ephemeral posture with zero backend; failure-detail broadcast is cheap-but-deferred; scaffold+reveal avoids editor coupling. The always-mounted hook is required so a WF4 `workflow:focus-run` toast restores a run's full timeline from any direction. Spec/design/tasks: `.specs/features/workflows-ui/` (WF5-01..25). |
| AD-009 | 2026-07-06 | **WF3 MERGED to `main` (PR #65).** Independent SDD eval (author≠judge, `spec-driven-eval`): **Final 0.98 — "Spec-complete"** (S=PASS, E recall/precision/justified ≈1.0, gates build/lint/unit green; live smoke owner-PASS 6/6). Two minor gaps merged as-is and **carried into WF4** (WF3-04 generic retry prompt; WF3-10 unasserted server reuse). **WF4 planning deferred to the next session.** | The two gaps are cheap polish on the same runner/`--resume` path WF4 already touches, so folding them into WF4 avoids a throwaway PR. Report: `.specs/features/workflows-agent-step/evaluations/P1-workflows-agent-step-20260706T141244Z.md`. |
| AD-008 | 2026-07-03 | **WF3 (Structured agent step) scope pinned via 4 owner decisions:** (1) **Arm M (MCP) only** — one shared loopback HTTP MCP server, per-step bearer token = auth+routing, forced `emit_result`; Arm N (`--json-schema`) dropped. (2) **ajv** for payload validation (promotes `emit-result-schema` off the spike's minimal checker; `expect` stays a JSON Schema). (3) `ctx.agent()` returns the **full envelope** `{status,data?,question?,sessionId}`; `blocked` is returned **as-is** (no engine pause in WF3 — that's WF4). (4) Permission presets **read/write/bypass**, default **read** (read = read-only tools + `emit_result`, guaranteed non-mutating). | Findings recommended Arm M to keep the `blocked` terminal value + per-step routing first-class for WF4; ajv because the author declares a JSON Schema and the tool `inputSchema` is JSON Schema too; full-envelope return lets WF4 add the pause without breaking the happy path; the preset set is PRD-fixed (US 26). Spec: `.specs/features/workflows-agent-step/spec.md` (WF3-01..25). |
| AD-013 | 2026-07-29 | **Worktree post-create hook (`worktree-post-create-hook`) scope pinned via 4 owner decisions + a decorator architecture:** (1) The command is declared **repo-locally** in a NEW `<repoPath>\.app\config.json` key `postCreateCommand` (mirrors the existing workspace-level `.app/config.json` reader one level down) — **not** in global settings, so it travels with the repo. (2) A failing hook **keeps the worktree**: `createWorktree` returns `ok:true` plus a `hook` failure payload (exit code + 4000-char output tail); no rollback. (3) The hook runs on **all three create paths** (New Worktree, Start Work, workflow `ctx.worktree.create`). (4) Feedback is **inline in the dialog on failure, silent on success**; the workflow run-timeline detail box is **P2/deferred**. **Architecture:** a `withPostCreateHook(create, deps)` **decorator** (Approach D) wraps `createWorktree` with an identical signature, wired **once** in `index.ts` and assigned to both the IPC handler and `ctxDeps.worktree.create` — so `worktree-manager.ts` (+ its ~40 real-git tests) and `workflow-ctx.ts` are **untouched**, and the run-iff-created rule (`ok && path`) is unit-testable against a fake create with no git and no spawn. The 120 s timeout's process kill stays in the hand-verified `index.ts` spawn seam; only its result *mapping* is unit-tested. | Repo-local won because the init script (`SetupSkills.cmd` in `m:\triade\source\Code`) is already checked in and resolves its own paths from `$PSScriptRoot` — the repo is what knows its init. Keeping the worktree matches the fact that `git worktree add` already succeeded; discarding a valid checkout (plus any base refresh / branch recut) over a fixable script error is the worse failure. All-three-paths because workflow-created worktrees for agents are the case that most needs the skills junctions. The decorator was chosen over a 7th positional param, a trailing options object, and a module-level setter because it is the only option that changes neither the real-git module nor the workflow ctx, and it avoids the parallel-test-hostile global state a setter would introduce. **Accepted trade-off, recorded not buried:** the command is repo content, so cloning an untrusted repo into a registered workspace means its `postCreateCommand` runs on the next create for that repo — no prompt, no allowlist in v1. Spec/design/tasks: `.specs/features/worktree-post-create-hook/` (WPC-01..24; 21 in the P1 slice, WPC-17..19 deferred). |
| AD-014 | 2026-07-30 | **Worktree removal is delete-first, project-wide.** The app deletes the worktree directory **itself** — `dir-remover.ts`'s `removeDirTree` (junction-safe, `maxRetries: 0` per attempt inside a 250 ms / 3000 ms deadline-bounded loop) — and only then calls `git worktree remove <path>` **purely to drop bookkeeping**. **No surface may use `git worktree remove --force` as a *deleter*** — not `WorktreeManager`, not `workflow-ctx`, not the deferred create-time cleanup. `force` keeps its FRWT meaning (**skip the dirty check only**) and never reaches git. The guard order is fixed at **primary → registered → locked → dirty → delete → bookkeeping**, and **every guard refuses before anything is deleted**; the registered check is also the anti-`rm -rf` guard and fails **closed** when git itself fails. **`git worktree lock` is checked by us**, from the porcelain `locked` line (a bare `locked` parses to `''`, which is still locked). **WRFT-07 (create-time leftover collision) is deferred to a follow-up PR** (owner decision at Tasks approval); this branch ships WRFT-01..06 plus the deleter and classification seams the follow-up lifts. | Two measured findings forced the inversion, one on each path. **(1) The success path destroyed data.** Git for Windows treats a directory junction as an ordinary directory and **recurses into it**, so `git worktree remove --force` emptied the shared *target* of AD-013's skills junctions and **reported success** — and because every hook-created worktree reads dirty (`?? .skills/`), the UI routed exactly those worktrees down the force path. Node's `fs.rm` lstats a junction as a link and **unlinks** it, leaving the target byte-identical (measured both ways). **(2) The failure path failed open.** Git deletes its bookkeeping even when the tree deletion fails — its own source comments *"continue on even if ret is non-zero, there's no going back from here"* — so one locked file left an **invisible orphan**: no `.git`, so `scanRepos` skips it, the row vanished on the next refresh, the folder later blocked recreating that worktree, and a retry answered `fatal: '<path>' is not a working tree`. Delete-first inverts that failure mode: git is never invoked, the worktree stays **registered**, and the still-visible row *is* the retry handle — which is also why no pending-cleanup persistence was needed. The lock guard has to be ours precisely because git's own refusal would arrive **after** we had already deleted the tree. WRFT-07 was deferred as P2 that rides on this branch's seams rather than blocking it. Spec/design/tasks: `.specs/features/worktree-removal-fault-tolerance/` (WRFT-01..07). |

| AD-015 | 2026-07-31 | **The post-create hook command can be declared OUTSIDE the repo, amending AD-013 decision 1 (which is extended, not reversed).** Three owner decisions: (1) the out-of-repo home is the existing **`<workspace>\.app\config.json`**, under a new `postCreateCommands` map **keyed by repo folder name** — not app-global settings, not a third config file; (2) **the repo still wins** — `<repo>\.app\config.json`'s `postCreateCommand` takes precedence and the workspace entry is the fallback, so WPC-01/WPC-06 keep holding verbatim and no existing behaviour changes; (3) **per-repo keys only** — no `"*"` default and no bare workspace-level string, so a newly cloned repo runs nothing until it is named. **Architecture:** a `resolvePostCreateCommand(repoPath)` composer in `repo-config.ts` wraps the two readers and is wired into `withPostCreateHook`'s `readCommand` — **the signature is unchanged**, because `scanRepos` only ever finds a repo as a *direct child* of its workspace (`repo-scanner.ts`), so the workspace is `dirname(repoPath)` and the key is `basename(repoPath)`. Derivation is purely **lexical**: no lookup against `AppConfig.workspaces`. Key matching is exact first, then a *unique* case-insensitive match (Windows folder names are case-insensitive, AD-005), with ≥2 variants and no exact match resolving to **no command plus one log** rather than an arbitrary winner. | The motivation is concrete: `m:\Triade\source\Code` is a shared team repo, so AD-013's in-repo file meant either a permanent `?? .app/` in `git status` or a PR into the team repo to record one developer's local automation. The workspace file already exists as a concept and is already hand-authored for `branchTemplate`/`worktreeTemplate`, so nothing new has to be discovered; app-global settings were rejected because they are per-machine, invisible to teammates and would need a settings-dialog surface to be editable at all. Repo-wins keeps the change additive — every pre-existing test passes unmodified. Per-repo keys were chosen over a workspace default because silently inheriting a command is the opposite of what moving the declaration out of the repo is for. Lexical derivation avoids coupling a pure file reader to app state, and it degrades safely: a `repoPath` that is not a workspace child simply finds no key. **Side benefit, recorded:** the workspace-level declaration does **not** carry AD-013's accepted untrusted-repo-content risk, because you author it yourself. Spec/validation: `.specs/features/worktree-hook-workspace-config/` (HWC-01..14). |
| AD-016 | 2026-08-28 | **A Visual Studio 2026 launcher ships alongside the 2022 one, and Visual Studio discovery becomes per-edition rather than per-install.** Four owner decisions: (1) 2026 launches **elevated**, mirroring VSAD's path exactly rather than introducing a non-elevated variant; (2) a **new `--pink` token** distinguishes it, because the board footer renders launchers as icon-only 15px buttons where two amber shields are indistinguishable; (3) both VS cards **always render**, install-agnostic, with a missing VS surfacing the existing toast; (4) the 2026 vswhere query is **GA-only** — no `-prerelease`. **Architecture:** a `VS_EDITIONS` map keyed by `ShortcutTool` gives each version its own vswhere range (`[17.0,18.0)` / `[18.0,19.0)`), passed as an **argument** through `resolveDevenv`/`openVisualStudio` rather than held as module state, and the three failure messages are templated off the edition label — which reproduces the 2022 wording character-for-character, so all six pre-existing VSAD tests pass with the test file byte-unmodified. | The ranges were **measured, not assumed**: VS 2026 reports catalog version `18.4.2` and installs under a *version-numbered* root (`\Microsoft Visual Studio\18\`), not a year-named one like 2022's `\2022\` — so nothing may key off the folder name and `productPath` is the only supported source. Disjoint ranges are what make coexistence deterministic instead of order-dependent; there is deliberately no shared "latest VS" resolution. `-prerelease` was rejected because on a machine with both stable and Insiders, `-latest -prerelease` can resolve Insiders and silently launch the wrong VS; an Insiders-only machine reporting "not installed" is the accepted trade-off. **Finding worth keeping:** the verification sensor caught that parameterizing a hard-coded value into a lookup table leaves the *wiring* untested — mutating `launch()` to send both VS tools to the 2022 edition left the whole suite green, meaning the 2026 card could have silently opened 2022. Fixed by asserting routing through the vanished-path guard, which returns before any spawn and so names the resolved edition without popping UAC. Spec/context/tasks/validation: `.specs/features/vs2026-admin-shortcut/` (VS26-01..05). |
| AD-017 | 2026-09-10 | **The `dev-alias-setting` feature ships only the settings field; the pre-existing `commitForm` `undoByte`-drop defect is deferred to a follow-up after PR #83 merges.** | `AgentDef.undoByte` exists only in PR #83 (`terminal-copy-undo-fixes`, open upstream) — the one-line preservation fix cannot compile against the `main` base (TS2353, measured). The branch stays clean and based on `main` per the fork workflow; the defect is recorded in the spec Out of Scope with the follow-up. |
| AD-018 | 2026-09-13 | **The rail's last-output preview is removed, retiring AGCF-08 AC-2 only.** `agents-rail-v2` RAIL-12 states that a session row renders the agent tile, name, short status, status dot and actions and **nothing else** — no worktree name, no branch line, no `lastOutput` tail. That directly supersedes AGCF-08 AC-2 ("a stopped card SHALL show up to 2 trailing lines of lastOutput"), which no longer describes any shipped surface. AGCF-08 **ACs 1, 3 and 4 stand unchanged** — they are `SessionManager` facts (a stopped session exposes the tail; respawn clears it; a restored session has none), still true and still covered by `src/main/session-manager.test.ts:332-353`. **`lastOutput` stays on `SessionView`** and on the IPC contract; nothing is removed from the data model. The smoke evidence is inverted rather than deleted: `scripts/smoke-agent-config.mjs` step 7 now asserts the data still exists AND that the rail renders zero preview elements. | Handoff §5 drops the preview from the rail, so a prior feature's spec would otherwise keep describing behaviour that no longer exists. Superseding one AC instead of the whole requirement keeps the three still-tested `SessionManager` guarantees intact. **Numbered 018 because `origin/main` already carries `AD-017` (`dev-alias-setting`, 2026-09-10)** — the reconciler `AD-017` sitting in the stash collides with it and must be renumbered independently, out of this feature's scope. |
| AD-019 | 2026-09-15 | **An agent session's activity comes from the agent's documented lifecycle hooks, never from reading its terminal.** For Claude Code (the only agent covered so far), the app appends `--settings <file>` to the launch. The file is regenerated per app launch with `type: "http"` hooks that POST each lifecycle event to a loopback endpoint in main. A per-session random token, passed as the env var `PLAYGROUND_ACTIVITY_TOKEN` and sent as `Authorization: Bearer`, is both authentication and routing (the AD-008 pattern). A pure state machine folds the events into `working` / `waiting` / `needs-approval` / `needs-input` / `error` / `compacting` / `exited` plus detail (running tool, subagent count, error type). The endpoint **always answers 2xx with an empty body**, so it never decides anything for the agent. Leaving `needs-approval`/`needs-input` is driven by the user's next real keystroke (mouse and focus reports excluded), because no hook fires between an approval and the approved tool's end. No activity state until the first event. Hooks disabled means today's `running`. `exited` finally delivers the `shell` sub-status that AM3 deferred for lack of a signal. Other agents get state only once each has a documented mechanism of its own. | Screen scraping was designed first and measured against three real recordings: it worked, but every marker it relied on (`esc to interrupt`, spinner glyphs, `❯`, the OSC 0 title glyphs) is undocumented UI, and the owner rejected it because Claude Code ships constantly. ConPTY forwarding a cell diff had already ruled out matching the raw PTY tail. The hook API is documented and versioned. `--settings` is per-session and merges with the user's hooks. HTTP hooks fail non-blocking when the app is unreachable. Env inheritance and `--settings` injection were verified with zero-token launches. Documented gaps accepted: `Stop` does not fire on Esc interrupts (a stale `working` until the next event or `idle_prompt`), and a `permission_prompt` notification lags ~6 s, which is why `PermissionRequest` (immediate, never fired for auto-approved calls) is used. Tests use documentation-shaped payloads, so no test spends tokens. `session-idle-notifications` builds on these states. Spec/design: `.specs/features/session-activity-status/`. |
| AD-020 | 2026-09-15 | **Claude Code does not deliver `SessionStart` to an `http` hook, so no app feature may depend on it.** Measured on 2.1.273 with zero-token probes: the same event, same session and same `--settings` file reached a `command` hook and not an `http` one, at launch **and** mid-session after `/clear`; a fresh session idle for 100 s produced no `idle_prompt` either, because the docs gate that on Claude having responded. Consequence for `session-activity-status`: a freshly spawned session holds **no activity** and renders the pre-feature `running` until its first turn, and `SessionEnd` with `reason` `clear`/`resume` maps to **`waiting`** (the CLI stays up at a fresh prompt and nothing else would correct it). The `SessionStart` mapping stays in the machine, documented as unreachable, for the day it is delivered. | The owner rejected the alternative: a `command` hook just for `SessionStart`. On Windows a shell-form command hook runs under Git Bash when installed and PowerShell otherwise, and the two disagree on how an environment variable is spelled, so the session token would reach the header on one machine and not the other — a per-machine behaviour difference in exchange for a state that is only wrong between opening an agent and speaking to it, which is exactly when the user is looking at the window. Second measured limitation from the same run, recorded here so it is not rediscovered: `contextBridge` freezes `window.api`, so a CDP smoke cannot instrument IPC call counts from the page. |
| AD-021 | 2026-09-16 | **Agent-session time tracking is owned by a main-process `TimeTracker`, and RAIL-12 is amended to allow a time counter on the session row.** The tracker is fed by an optional `SessionManager` lifecycle observer (`started` at the end of `#start`, `ended` in `#finalize` only when the session was running) and by `powerMonitor` suspend/resume; screen lock is deliberately not observed. Closed periods live in `userData/time-log.jsonl` (one versioned JSON line each, atomic rewrite on edit); open periods live in `userData/time-open.json`, heartbeated every 60 s and closed at their last-seen instant on the next start. Renderer totals and the weekly Hours report are pure functions over a `time:snapshot` (`time-totals`, `hours-report`, `hours-copy`). **RAIL-12 amendment:** a session row MAY render the session's `hh:mm:ss` time counter, and a group head row its `hh:mm` total; everything else RAIL-12 forbids on a row stays forbidden, and Pause time lives in the detail bar, not on the row. | Owner decisions Q6–Q24 of the `time-tracking` grilling: counting follows the terminal being alive, not agent activity, so the main process that owns PTY start/exit and power events is the only place that sees every boundary, and a single writer keeps the log consistent. The row counter is the everyday surface the owner asked for (Q10) and contradicts a shipped requirement, so the amendment is recorded rather than implied. **Numbered 021 because `develop` already carries AD-019 and AD-020** (`session-activity-status`, not yet on `main`). Spec/design/tasks: `.specs/features/time-tracking/` (TIME-01..49). |
| AD-022 | 2026-09-19 | **The Files direction is one epic, grilled once and specified slice by slice, on a stack of branches.** Six features: `status-bar` (prerequisite), then F1 `files-explore`, F2 `files-diff`, F3 `files-commits`, F4 `files-pr-ado`, F5 `files-pr-github`. `feature/status-bar` is cut from `main` and each slice from the one before; each reaches upstream as a PR marked "depends on" its predecessor and is rebased with `--onto origin/main` as that merges. While a slice is unexecuted, a later slice's needs are met by **amending the earlier plan** — F2's `AllChangesTab` takes its data by props (for F3), F4's pull-request model is provider-neutral (for F5) — never by a refactor task against verified code. **Numbered 022 because `develop` and PR #93 already carry AD-021**, so this table, cut from `main`, skips it. | One design tree caught the decisions that cross slices — one base per worktree, one inert renderer, one URL posture — that five separate grills would have answered five ways. AD-006 (the Workflows epic) specified milestone by milestone for the same reason. Stacking is the fork workflow's rule for dependent features, and each slice is useful on its own, so a stalled review blocks at most what sits above it. Plans: `.specs/features/{status-bar,files-explore,files-diff,files-commits,files-pr-ado,files-pr-github}/`. |
| AD-023 | 2026-09-19 | **Every git invocation goes through `src/main/git.ts`, and no surface reaches the network unless the user asks.** `status-bar` T1 extracts `git()` and `gitFailureLine()` from `worktree-manager.ts` into `git.ts` — `execFile`, `shell: false`, `windowsHide`, `GIT_TERMINAL_PROMPT=0`, an optional `timeoutMs` — and every later module (status bar, Files lists, diffs, commits) imports it; none spawns git itself. The status bar reads local refs only (`rev-list --left-right @{upstream}...HEAD`, and `FETCH_HEAD`'s mtime for staleness); fetch, pull, push, sync and publish run only on a click. Sync is `pull --ff-only` then `push`, the posture of the existing base refresh (WBR); execution added `--no-rebase` to the pull, because Git for Windows sets `pull.rebase=true` system-wide and that turned it into a rebase (`status-bar` STBR-17). | The guarantees that matter — no shell for quote safety, no credential prompt hanging the main process, a ceiling on a hung process — must not diverge between copies. Automatic fetching was rejected by the owner: with several repositories registered it would hit the network constantly and could raise a credential manager window unasked. `--ff-only` can refuse but can never produce a conflict or a merge commit. |
| AD-024 | 2026-09-19 | **The renderer never reads the filesystem.** Every file the Files direction shows is listed and read in main — `git ls-files` per expanded folder, `git show` for revisions, `readForView` for the disk — and every path the renderer sends is confined to the selected worktree by the lexical `resolveInside`. Binary files (a NUL in the first 8000 bytes, git's heuristic) and files above 1 MB are never sent to the renderer. Disk watching is one recursive `fs.watch` on the selected worktree **plus** watches on its git-dir `index` and `HEAD`, with the reaction — not the watch — scoped to open tabs and the current list. | Measured while designing F1: a linked worktree's git-dir is `<repo>/.git/worktrees/<name>`, outside the worktree, so a root-only watch never sees a commit or a `git add`. One confinement point in main is auditable; a renderer with filesystem access, in an app that also runs agents, is not. |
| AD-025 | 2026-09-19 | **Monaco is the app's read-only code and diff viewer.** Only `editor.api`, the Monarch basic-language contributions and `editor.worker` are loaded — no TypeScript, JSON, CSS or HTML language services — and the worker is a same-origin file, never a `blob:` URL, because the renderer CSP (`script-src 'self'`, no `worker-src`) forbids blob workers and WebAssembly. The theme follows the app (`vs` / `vs-dark`). Line-ending changes are detected in main from raw bytes, because Monaco normalizes line endings inside its text model. F1's T13 is a packaged-build spike and a stop point before any viewer component is written. | The owner asked for files to read "like VS Code", and Monaco's `DiffEditor` gives F2 side-by-side and inline diffs natively. CodeMirror 6 was lighter but not that look; Shiki with a hand-built diff would have made F2 a diff engine, and its default WASM engine is blocked by the CSP. Bundle growth is measured in the spike, not assumed. |
| AD-026 | 2026-09-19 | **Third-party content is rendered inertly, and only main opens URLs.** PR descriptions and comments are rendered by `markdown-it` with `html: false`: no HTML is parsed, so there is nothing to sanitize; links keep only a `data-href`; images render as links and never load. The renderer never navigates and never calls `window.open`. Main opens a URL only if it is `https:` and either **built by the app** from a remote `parseRemote` recognizes — commit, PR, compare and create pages, never copying credentials embedded in a remote URL — or, for a link inside third-party content, passes the `https:`-only `isOpenableLink` check. | F4 is the first time the app renders text other people wrote, inside an Electron app that runs agents with disk access, and not parsing HTML is stronger than cleaning it. **Pre-existing and outside this epic:** the template's `setWindowOpenHandler` (`src/main/index.ts:194`) forwards any URL the renderer opens straight to `shell.openExternal`. None of these features uses it; restricting it to `https:` is a recommended separate fix. |
| AD-027 | 2026-09-19 | **The app writes to Azure DevOps and GitHub for pull-request comments only, and only on an explicit user action.** The whole write surface: reply to a thread; change a thread's state (Azure DevOps' statuses, GitHub's resolve / reopen); start a thread from a text selection; post a general PR comment. No votes, approvals, merges, PR creation or background writes. The README's "ADO integration is view-only" is amended when F4 ships (F4 T26) and names GitHub when F5 ships (F5 T21). Spikes and smokes that write run only on a sandbox PR or scratch repository the owner names — **never on this repository's upstream, whose PRs notify real maintainers** — and record conventions under fictitious names only. | Owner decisions of the epic grill (Q6, Q10, Q12). Every write being the direct result of a click keeps the app's posture legible: it acts on what the user sees, never on its own. The public-repository privacy guardrail rules out real organization data in findings and fixtures. |
| AD-028 | 2026-09-19 | **Effective when `files-explore` ships: FXPL-31 supersedes STBR-30 and STBR-32.** The status bar's changed-file counter stops opening its popover and instead switches to the Files direction in uncommitted-changes mode on that worktree, remembering that mode (FXPL-31/32). `ChangesPopover` is retired in F1 T22, which also annotates both STBR requirements. Until F1 ships, `status-bar` delivers the popover exactly as specified. | The popover was always the counter's stand-in for a surface that did not exist yet (owner decision, epic grill Q8). Recording the supersession ahead of time follows AD-018: a merged spec must not keep describing behaviour that no longer ships. |


## Handoff

**Status (current, 2026-09-19): `session-strip-polish` COMPLETE. T1-T6 are executed, and the
independent Verifier returned **PASS** in round 2 of 3, on branch `feature/session-strip-polish`
(cut from `develop` at `9919139`). Pushed to `fork`, merged into `develop`, and **draft PR #98** open upstream (stacked on #93 and #94). Report: `.specs/features/session-strip-polish/validation.md`;
`validate_state.py` exits 0.**

- **Commits:** T1-T6 are `5522aa8`..`adcaaa4`. Then `19ef7bc` closed the Verifier's round-1
  gaps, `80dbb7f` records the report and `423d055` adds lessons L-030..L-032 (L-038..L-040 on `develop`).
- **Verification:** the suite went from 1200 to **1216** tests (69 files). Typecheck, lint
  (17 warnings, the baseline) and `npx electron-vite build` all exit 0. The discrimination
  sensor killed 11 of 11 mutants. `scripts/smoke-strip.mjs` ran **24/24** against the dev
  app, and the repaired `scripts/smoke-time.mjs` ran **26/26**.
- **Spec correction:** the spec assumed that a session stopped while paused keeps its paused
  flag. It does not: `TimeTracker.ended` drops the run with its mark, and a respawn starts
  counting again. The edge cases and the assumption row are marked `[corrected at Execute]`.
  The tracker is unchanged, because it is out of scope.
- **Owner-pending hand checks:**
  - the clock button in light and dark: hover border, focus ring, and a paused clock staying
    dim on hover;
  - a screen reader announcing the clock as a pressed / not-pressed toggle.
- **Next:**
  - owner hand checks;
  - done: pushed to `fork`, merged into `develop` with L-030..L-032 renumbered L-038..L-040;
  - the upstream PR waits for #93 and #94, then
    `git rebase --onto origin/main 9919139 feature/session-strip-polish`.
- **Follow-up, not in scope:** `smoke-time.mjs:186` selects the first running row under
  `C:\Windows`, not the session it spawned. It could pause an owner's session in that folder.

### Previous handoff: `status-bar`

**Status (current, 2026-09-19): `status-bar` COMPLETE -- T1-T18 executed and independent Verifier
**PASS** (round 3 of 3) on branch `feature/status-bar`, cut from `origin/main` `6ecd19c`. Pushed to
`fork` and **PR #97 open upstream** (`viniciussaide:feature/status-bar` -> `obogoni:main`, opened
2026-09-19 with owner go-ahead; CI `gate` **pass** in 4m6s, `mergeStateStatus` CLEAN, 31 files / +5351 -27). Merged locally into `develop`. Report:
`.specs/features/status-bar/validation.md`; `validate_state.py` exit 0.**

- **Verification:** suite **917 -> 979** (52 -> 55 files); typecheck, lint (18 warnings, the
  pre-existing baseline) and `electron-vite build` exit 0. CDP smoke `scripts/smoke-status-bar.mjs`
  **57/57** against the live dev app. Verifier round 3: 32/32 ACs and 6/6 edge cases evidenced,
  8/8 mutants killed. Rounds 1-2 failed on evidence gaps and led to three product fixes: the
  late sync-state answer race, the deleted-worktree-folder state, and `--no-rebase` on Pull/Sync.
- **After the PASS, owner tweaks** covered by gate + smoke only: Visual Studio git glyphs on the
  popover buttons, the branch split in half, and the branch cap raised from 50% to 70% of the bar.
- **Open notes:** the spec says five directions and this branch has four (Hours arrives with #93);
  the timeout message text is not asserted; `src/main/index.ts` still runs git directly in the
  workflow fetch path, against AD-023. Candidate lessons L-019..L-026 await promotion.

**Next:** F1 `files-explore`. `feature/files-explore` .. `feature/files-pr-github` were cut from the
old status-bar tip `eb78540`; rebase the stack onto `feature/status-bar` before executing F1, and
re-anchor F1's test baseline to **979**. After #97 merges upstream: `git fetch origin` -> `main`
fast-forward -> merge `main` into `develop`, then `git rebase --onto origin/main feature/status-bar
feature/files-explore` per AD-022.

### Prior: terminal-scroll-paste and earlier (carried over from `develop`)

**Status (2026-09-17): `terminal-scroll-paste` COMPLETE -- T1-T14 executed and
independent Verifier **PASS** (round 2 of 3) on branch `feature/terminal-scroll-paste`, cut from
`origin/main` `fa78f78`. Phases 6 and 7 SKIPPED (Q2 verdict: cause 3 only; TSP-29..34 `Withdrawn`).
Nothing uncommitted. **Pushed to `fork` and PR #95 open upstream**
(`viniciussaide:feature/terminal-scroll-paste` -> `obogoni:main`, opened 2026-09-17 with owner
go-ahead; CI `gate` **pass** in 4m56s, `mergeStateStatus` CLEAN, 24 files / +3247 -117). Report:
`.specs/features/terminal-scroll-paste/validation.md`; `validate_state.py` exit 0.**

- **Verification:** suite **748 -> 820** (46 -> 51 files); typecheck/lint/test and
  `npx electron-vite build` all exit 0. Round 1 **FAIL on evidence, no code defect** (18/18 mutants
  killed); round 2 **PASS** with **23/23 mutants killed** -- the 18 re-run verbatim plus 6 new ones
  on the changed test. 26/34 non-withdrawn ACs fully matched, 4 spec-precision, **7 owner-accepted
  hand-verification items enumerated, 0 silent passes.**
- **The Verifier ran a counterfactual on the one code change rather than trusting the claim:** the
  memoised-`rand` mutant and a constant-suffix mutant both **survived** the old TSP-38 assertion
  (exit 0, 20 passed) and both **die** against the new one. The second mutant keeps `randCalls === 2`
  honest and would defeat a call-counter-only assertion; the path assertions catch it.
- **Lint baseline moved and exit code hid it.** The fix round added a 19th prettier warning in its
  own file against a baseline of 18, invisible at exit 0 because warnings do not fail the gate.
  Fixed with `npx eslint --fix src/main/clipboard-reader.test.ts`; back to 18. **Record the count and
  diff the count -- judging lint by exit code alone is correct for errors and blind to drift.**

- **Commits:** `194aa4f` spec, `b3b41e3` + `1467c64` requirement-id realignment, then T1-T13 in
  `90830f3`..`02f1413` (one per task). Suite **748 -> 819** (46 -> 51 files); `typecheck`, `lint`
  and `npm test` exit 0, `npx electron-vite build` exit 0, verified by the orchestrator at the
  phase boundary, not only by the workers.
- **What shipped:** `src/shared/paste.ts` (`planPaste`, `quotePath`, `PASTE_GAP_MS`), the
  `clipboard:read-paste` channel and the `pathForFile` bridge, `TerminalModeTracker`, a
  `SessionRingBuffer` whose `snapshot()` prepends the modes its trimmed head carried (`tail()`
  stays unprefixed -- cause 3, unconditional), `clipboard-reader`, `paste-temp` purge,
  `terminal-modes.ts` (`modeName`, `formatModeLog`, `isProbeEnabled`), and in `TerminalPane.tsx`
  the flag-gated mode probe, one serialized paste queue behind both Ctrl+V and right-click, and
  file drop.

**T14 verdict (owner UAT, 2026-09-17): cause 3 only.** The probe logged, and the scroll never died
in any scenario the owner tried, including repeated Ctrl+C in opencode. T4 had already fixed cause 3
unconditionally, and the original intermittent symptom matches it. **The evidence is a
non-reproduction, not a measured difference:** the A/B against the pre-T4 1.1.1 install was offered
and declined in favour of shipping, so this does not prove causes 1 and 2 cannot happen. The probe
stays behind `playground.debug.terminalModes` so a returning defect is diagnosed against evidence.

**To run the probe again:** `npm run build && npm start` -- **an installed/packaged build cannot run
it**, because `optimizer.watchWindowShortcuts` (`src/main/index.ts:202`) only wires F12 to DevTools
while unpackaged and blocks Ctrl+Shift+I when packaged. Set
`localStorage.setItem('playground.debug.terminalModes', '1')`, enable **Verbose** in the console
level dropdown (the probe uses `console.debug`, hidden by default), then remount the pane.

**Verifier round 1 FAIL -- what it found and what was done, all resolved or accepted (owner decided:
record honestly, do not refactor for testability):**

- **7 ACs had no evidence of any kind and were missing from T14's owner-pending list**, so they read
  as verified in Traceability: TSP-02, 03, 20, 23, 24, 26, 28, all pane-local. Now enumerated under
  T14. The riskiest are **TSP-23/24** -- the serialized paste queue and its cancel-on-unmount, the
  most intricate new logic here, shipping source-verified with no test by owner decision.
- **TSP-38's assertion was tautological** (proved only that `pasteImageName` embeds the `rand` it is
  handed; a suffix cached per module would have survived it). Replaced with a `readClipboardPaste`
  test that pastes twice under one fixed `now` and asserts both paths and `randCalls === 2`.
  Mutation-checked: caching `rand` now fails the test. Suite 819 -> 820.
- **TSP-16's 5 s timeout and the exact chip text stay unasserted literals** (`src/main/index.ts:94`,
  `TerminalPane.tsx:31`) while `PASTE_GAP_MS`/`COPIED_FEEDBACK_MS`/`PASTE_MAX_AGE_MS` were all pulled
  into tested seams. Same convention, three exceptions -- accepted, not fixed.
- **Third TSP-citation drift on this feature**, swept: the coverage matrix cited withdrawn ids and
  `design.md` had no withdrawal marker. Citations inside the T15..T19 bodies are intentional.
- Cleanup audit passed: the probe's CSI handlers `return false` unconditionally (returning `true`
  would swallow every DECSET/DECRST and manufacture a superset of the bug, on flagged machines only,
  with nothing in the suite to catch it), and no path writes to a disposed terminal. **One narrow
  real defect left unfixed:** the replay `term.write(data, cb)` callback reads `term.modes` and can
  fire after `dispose()` -- probe-only, so flag-gated. The Verifier's other note, that the cleared
  `gapTimer` permanently retains the disposed terminal, **does not hold and was withdrawn in round
  2**: a pending promise is not a GC root, so the closure graph is collectable once unreachable. The
  mechanism is inverted -- **not** clearing the timer is the retaining case, since a live timer holds
  `resolve` -> promise -> continuation -> `term` for up to `PASTE_GAP_MS`.

**What the PASS does not claim, stated because it is the accepted risk:** nothing is verified about
`TerminalPane.tsx`. **TSP-23/24** -- the serialized paste queue and its cancel-on-session-change, the
most intricate new logic here -- ship on source review alone, and the 23/23 kill rate does not extend
to them. The Verifier re-read the disposal path in both rounds and found no route where a disposed
queue writes to a dead terminal.

**Deliberately left as-is (cosmetic, recorded not fixed):**

- `spec.md` Traceability reads `Implementing` for all 34 non-withdrawn ACs, so it does not
  distinguish the 26 verified from the 7 accepted-pending. **This matches the project convention** --
  `agents-rail-v2` is merged and Verifier-PASS and still reads `Implementing` throughout -- and it
  under-claims, so nothing is falsely green. Introducing a per-AC status scheme on this branch alone
  would diverge from every other feature.
- The post-dispose replay callback: `term.write(data, cb)`'s callback reads `term.modes` and can fire
  after `dispose()`. Probe-only (`replayPending = probing`), worst case a console throw on a terminal
  that is already gone, no PTY or data consequence. A one-line `if (pasteDisposed) return` would close
  it by reusing the existing flag.

**Next:** PR #95 is open and awaiting review; `origin/main` is still `fa78f78`, so no rebase is
needed. The feature is **not** merged into `develop` yet. After the upstream merge: `git fetch origin` -> `main`
fast-forward -> merge `main` into `develop`. Expect a Handoff conflict and the lessons renumbering
that `time-tracking` (#93) and `session-idle-notifications` (#94) also need.

**A HOLE IN THE SKILL'S OWN CLOSING GATE -- do not trust `validate_state.py` blindly.** Reproduced
this session with a synthetic report: a `validation.md` whose verdict reads `**Verdict: FAIL**` in
prose **passes with exit 0**. `_verdict()` builds its haystack only from lines matching
`^#{1,4}\s*validation\b` or an unanchored `\*{0,2}result\*{0,2}\s*:`, so the Discrimination
Sensor's own `**Result**: ... killed ... PASS` line -- which `validate.md`'s template prescribes --
becomes the only match and reads as a pass. This feature's report only exits 1 because its heading
happens to be `## Validation: ... FAIL`. The owner decided 2026-09-17 not to patch the skill; verify
a verdict by reading the report, not by the exit code.

**Spec-precision gaps recorded during Execute (in `tasks.md`, not silently absorbed):**

- **TSP-01** does not define the probe line's layout. The shipped shape is
  `[term-modes] <id> CSI ?1049;1003;1006h alt-screen,any,sgr-mouse tracking=any buffer=alternate`,
  pinned by test, and TSP-02/03 follow it. The `tracking=`/`buffer=` readouts are taken in a
  `queueMicrotask` because xterm has no per-sequence post-apply hook: exact for a mode change that
  arrives alone (the diagnostic case), settled-state for several changes inside one PTY chunk.
- **TSP-16** says the failure chip sits "next to" the "Copiado" chip but also that it reuses that
  element and timing. Implemented as reuse, so "Não foi possível colar" inherits the chip's green
  background. A red variant is outside T12's Done-when.
- `planPaste({kind:'text', text:''})` is undefined by the spec; returns `['']` and is unreachable
  from `readClipboardPaste`.

**Found during Execute, worth keeping:**

- The edge-case requirement ids in `tasks.md`/`design.md` were **3 below** `spec.md` -- the edge
  cases moved to TSP-35..40 when the conditional blocks took TSP-29..34. Twelve citations fixed in
  `b3b41e3` and `1467c64`. The TSP-29..34 references in T15..T19 are the conditional ids and are
  correct.
- **Ctrl+Alt+V classified as `paste`** before T10, which would have swallowed the AltGr/Alt+V chord
  Claude Code on Windows uses to read the clipboard itself (TSP-17). Fixed by excluding `altKey`,
  mirroring the Ctrl+Z branch (`terminal-keys.ts:117` and `:122`). Latent defect, not a regression
  of this branch.
- **`<skill-dir>/scripts/lessons.py list` destroys data.** Run to load confirmed lessons, it
  rewrote `.specs/lessons.json` and `.specs/LESSONS.md` and **deleted all 13 candidate lessons**,
  keeping only the 2 confirmed ones it was asked to list. Reverted with `git checkout --`; restored
  state is 15 lessons / 13 candidates / `next_id` 17. Do not run it; read `lessons.json` directly.

**Merged into `develop` 2026-09-17** (`--no-ff`). Both conflicts were additive and resolved as
the union: `src/main/index.ts` (this feature's `clipboard`/`randomBytes`/`fs.promises`/`tmpdir`
imports and `readFileDropList` next to the notifications feature's `powerMonitor` and
`readBranch`), and this Handoff. **`lessons.json` did not conflict**, because the Verifier's
proposed lessons were deliberately not recorded -- the skill's `lessons.py` deletes candidate
lessons, so `next_id` stays at `develop`'s 30 and the renumbering #93/#94 needed does not apply
here. Recording those lessons is still open.

**STILL TRUE from earlier handoffs (carried over):**

- `session-activity-status` (PR #88): owner smoke 19/19 PASS; the two-theme visual pass of the
  activity dots/loader and `prefers-reduced-motion` (ACTV-14/15/17/20) is still owner-pending.
- Deferred follow-up: the three `quota_auto_resume_*` notification types are not consumed, so a
  session paused by a usage limit stays `error` after Claude resumes (`_fired` → `working`,
  `_stale` → `needs-input`, `_disabled` → `waiting`; Claude Code v2.1.234+).
- `agents-rail-v2` two-theme visual pass (RAIL-26/27) is code-verified only; `opencode` and
  `Ad-hoc` both resolve to `--amber` at 22×22.
- The `wip(reconciler-core)` stash is gone from this clone; if it is not in another clone it is lost.
- AD-017 follow-up: preserve `undoByte` in `SettingsDialog` `commitForm` (PR #83 has merged).
- **PENDING -- bump the committed `package.json` version on the next delivery:** `v1.0.0` shipped
  2026-09-02 from `cafb43f`, but the bump was never committed -- `main` still reads `0.1.0` and
  nightlies publish `0.1.0-alpha.N`, semver-sorting below the shipped stable. Bump to `1.1.0`.

**Prior (2026-09-16): `session-idle-notifications` EXECUTED + independent Verifier PASS
(round 6, after rev4 and rev5). Owner smoke 36/36. PR #94 open upstream
(`viniciussaide:feature/session-idle-notifications` → `obogoni:main`, "depends on #88"), merged
locally into `develop`.**

- **Branch:** `feature/session-idle-notifications`, stacked on `feature/session-activity-status`
  (`65de9fd`, PR #88 still open upstream). Spec/design/tasks `c5e2304`..`4e7e69a`, code
  `2e6bf64`..`40ab12f` (13 tasks), fix round `b3a00b3`.
- **What shipped:** main decides (`activity-notification.ts` pure rules + `SessionNotifier`);
  `SessionManager` reports each activity transition; OS notification when the window is
  unfocused, in-app notice stack when focused on another session, nothing for the attached one;
  a first event never notifies (NOTF-27). Settings dialog split into General / Notifications
  tabs with a master switch plus one per state, flat `ui.notify*` keys, absent = on. Shared
  `showOs` now holds each `Notification` until click/close, which also covers workflow toasts.
- **Verification:** suite 917 → **990**. Round 1 FAIL on evidence only (NOTF-05 direction half,
  06, 21, 23, 29 agent form) with 20/21 mutants killed (1 equivalent); round 2 PASS after smoke
  and spec fixes. Report: `.specs/features/session-idle-notifications/validation.md`.
- **Owner smoke 2026-09-16: 34/34 PASS**, including a real Windows notification and its click.
  Two earlier runs stopped on smoke defects (rail v2 row labels; xterm not rendering while the
  window is hidden), fixed in `d641837` and `57d88fc`. Still hand-verify: a notification clicked
  after a minute, a minimized window, and the two-theme pass of tabs and notices.
- **rev4 increment (2026-09-16), P4 NOTF-30..36:** the notification names the session's task —
  title `#<id> · <pinned task title>` (or `#<id>`), clipped to 60 characters until rev5 removed the cut; agent and session
  as a second body line; branch read with `git symbolic-ref --short HEAD` (2 s), no ADO call.
  T14–T20 `ec0d66b`..`d1d5f94`, fix round `b522d5f` (also catches async notifier failures).
  Suite 990 → **1006**; Verifier round 3 FAIL on evidence, round 4 PASS (18/18 mutants).
  **Owner smoke 2026-09-16: 36/36 PASS**, and the Windows toast shows the three lines separately
  (no ` — ` fallback needed).
- **rev5 (2026-09-16), whole titles:** owner decided the app never cuts a title — no 60-character
  limit, no `…`; the in-app title wraps freely. T21–T23 `133794e`..`39a589c`, fix round `ffc773c`
  (test for a long session title on the body's second line). Suite **1006**; Verifier round 5
  FAIL (1 surviving mutant), round 6 PASS (8/8). Owner hand check: a long pinned task title shown
  whole in the in-app notice; Windows may shorten its own toast title.
- **Merge into `develop`:** conflicts with `time-tracking` were all additive (`lifecycle` and
  `onActivityChange` deps, `time:changed` next to `session:notice`/`session:focus`, both
  `SessionManager` describe blocks). Lessons collided again: on `develop` this feature's
  candidates are **L-025..L-029** (`next_id` 30); on the PR branch they are still L-019..L-023.
  **Whichever of #93 / #94 merges second must renumber the lessons the same way.**
- **Next:** when #88 merges,
  `git rebase --onto origin/main feature/session-activity-status feature/session-idle-notifications`;
  after #94 merges, `git fetch origin` → `main` fast-forward → merge `main` into `develop`.

**Prior (2026-09-16): `time-tracking` EXECUTED + independent Verifier PASS
(iteration 3 of 3), PR #93 open upstream (`viniciussaide:feature/time-tracking` →
`obogoni:main`, CI `gate` pass, mergeable, awaiting review), merged locally into `develop`
(`ad4ea03`).**

- **Branch:** `feature/time-tracking`, cut from `origin/main` `fa78f78`, 36 commits
  (`b1c6fdf` spec … `94e3493` validation). Pushed to `fork`.
- **What shipped:** a main-process `TimeTracker` (AD-021) records dated periods per session
  PTY run, with manual pause, suspend/resume handling, a 60 s heartbeated sidecar for crash
  recovery, and delete/adjust. Counters on the rail row, group heads, detail bar, worktree
  detail and pinned task cards; a weekly **Hours** direction with per-day Copy for Clockify.
- **Verification:** suite 748 → **865** on the branch (1039 on `develop` after the merge).
  Verifier round 1 FAIL (red lint gate misreported as green, TIME-14 rewrite not retried, 3
  surviving mutants), round 2 FAIL (1 survivor in the retry fix), round 3 PASS: 25/26
  mutants killed, 1 equivalent; 39 ACs test-backed, 10 hand-verified. Smoke
  `scripts/smoke-time.mjs` 26/26 on the branch and on `develop`; crash recovery checked by
  hand. Report: `.specs/features/time-tracking/validation.md`.
- **Gate lesson (process, this session):** always judge `npm run lint` / `typecheck` /
  `test` by **exit code** — the `… potentially fixable` line of ESLint's summary is not the
  error count.
- **Merge into `develop`:** conflicts with `session-activity-status` were all additive
  (both `hooks` and `lifecycle` deps, counter before `StatusIndicator`, AD-019/020/021 rows).
  Lessons collided: on `develop` the time-tracking candidates are **L-019..L-024**
  (`next_id` 25); on the PR branch they are still L-017..L-022. **Whichever of #88 / #93
  merges second must rebase and renumber the lessons the same way.**
- **Owner-pending:** run `node scripts/smoke-time.mjs` yourself and record it in
  `validation.md`; exercise OS suspend/resume (TIME-06/07) and the Hours minute refresh
  (TIME-42) in the running app. Spec wording gaps, not defects: the owner's Copy preview was
  never recorded (TIME-39) and the open-block `HH:MM–now` rendering is unspecified (TIME-36).
- **CDP hand checks on this machine:** use an ad-hoc `pwsh` session in `C:/Windows` — the
  `Claude` registry agent launches the real CLI — and the dev app shares the real
  `%APPDATA%\playground` (real sessions and time log).
- **Next:** after #93 merges upstream, `git fetch origin` → `main` fast-forward → merge
  `main` into `develop`. Untracked spec awaiting its own session:
  `terminal-scroll-paste` (Q2, the scroll cause, still open).

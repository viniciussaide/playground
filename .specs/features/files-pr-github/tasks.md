# Files Direction — GitHub Pull Requests (F5) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-pr-github/design.md`
**Status**: Draft — reconciled with F4 as shipped on 2026-10-10

**Branch**: `feature/files-pr-github`, stacked on `feature/files-pr-ado` (F4, PR #169). The two plan commits were rebased with `git rebase --onto feature/files-pr-ado 694b483` on 2026-10-10 (onto `f837489`); the pre-rebase tip is kept as `backup/files-pr-github-prerebase`. Once #169 merges, `git rebase --onto origin/main feature/files-pr-ado feature/files-pr-github`, and the PR's description drops its "depends on #169".

**Prerequisite**: F4 executed. It shipped the neutral model only in part, so **Phase 2 (T2–T6) makes it provider-neutral first** — owner decision, 2026-10-10 (design § Reconciliation).

**Test baseline**: **3058 tests / 136 files**, all passing, measured 2026-10-10 with `npx vitest run` on the rebased branch. Every count below rests on it; this feature ends at **3122**.

**Outward writes**: T1 and T27's `--allow-writes` mode write to GitHub. Both run **only on a draft PR whose base and head both live in the owner's fork of this repository** (owner, 2026-10-10), on throwaway branches, **with the owner's explicit go-ahead at that moment** — approving these tasks does not authorize them. `gh pr create` there always passes `--repo <fork>` and `--base`, because its default base is the upstream. **Never a write against this repository's upstream (`obogoni/playground`), whose PRs notify real maintainers**; reads of an upstream PR (GET) are allowed. Every client test uses a fake `fetch` and a fake `gh` runner.

**Privacy guardrail**: fixtures and tests use fictitious owners and repositories (`acme/widget`, fork owner `contoso`). Findings and smoke output name no coordinates; those come from environment variables.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (coverage includes `src/main/**` and `src/shared/**`), `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| F4 neutralization (T2–T6) | existing F4 tests + unit for new pure helpers | No ADO behaviour changes; F4 tests edited only where a value's type changed | co-located `*.test.ts` | `npm test` |
| Gateway (`github-gateway.ts`) | unit (fake runner + fake `fetch`) | Every `gh` exit path; rate-limit detection in REST and GraphQL; headers; 401 | `src/main/github-gateway.test.ts` | `npm test` |
| DI client (`github-pr.ts`) | unit (fake `fetch`) | Exact URLs and bodies; every pagination to its end; head side from the head repository; no write on a read path | `src/main/github-pr.test.ts` | `npm test` |
| Pure modules (`shared/pr-diff-rules.ts`, `github-pr-model.ts`, `pr-locate.ts`, `remote-url.ts` additions, `pr-view.ts`) | unit | 1:1 to the ACs each decides, every edge case | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts`) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hooks | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-pr-github.mjs` |
| Docs | none | — | — | review |
| Spike findings | manual | Each **[spike]** item in the design | `design.md` § Spike Findings | by hand |
| Out-of-CI smoke | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-pr-github.mjs` (owner's fork) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | T1 and T27 | by hand / `node scripts/smoke-files-pr-github.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T2 and diff it at every gate.

---

## Execution Plan

### Phase 1: Measure GitHub on the owner's fork

```
T1
```

**Owner-gated stop point.** Its findings may change the design; if they do, the design is amended in T1's commit and later phases re-checked before T2.

### Phase 2: Make F4 provider-neutral

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 3: Pure foundations

```
T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 4: The client, its wiring and the comment plan

```
T13 → T14 → T15 → T16 → T17
```

### Phase 5: GitHub in the Pull request mode

```
T17 → T18 → T19 → T20 → T21 → T22 → T23 → T24 → T25
```

### Phase 6: Close the loop

```
T25 → T26 → T27
```

---

## Task Breakdown

### T1: Measure what the reference left open

**What**: On a draft PR in the owner's fork — base and head both in the fork, on throwaway branches with fictitious content — and with the owner's go-ahead at that moment, measure the design's **[spike]** items and record them in `design.md` under **Spike Findings**, fictitious names only. The cross-fork merge base is measured read-only on an existing fork → upstream PR.
**Where**: `.specs/features/files-pr-github/design.md`
**Depends on**: None
**Reuses**: `gh api` from a scratch script outside the repository.
**Requirement**: FPRG-12, 19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] **Out-of-hunk anchors**: an anchored comment inside a hunk, one on a context line outside every hunk, and one spanning two hunks — recorded which GitHub accepts and the exact error of the others (the spec's open question)
- [x] **Immediate posting**: the REST anchored comment and reply are visible without submitting a review (read back by REST and GraphQL: no `PENDING` review exists)
- [x] **Resolve / unresolve**: `resolveReviewThread` and `unresolveReviewThread` on a probe thread, and the `viewerCan*` values before and after
- [x] **Merge base on a fork PR** (GET only, on the upstream): `compare/{baseSha}...{headSha}` in the base repository with the fork's head sha — recorded whether it resolves; if not, the `{headOwner}:{headRef}` form
- [x] **Files and patches**: the `patch` field's hunk headers on a file with two hunks; what a binary file returns
- [x] Every probe comment is deleted afterwards, the draft PR closed and its throwaway branches deleted
- [x] **No write is sent to `obogoni/playground`**
- [x] If a finding contradicts the design, it is amended in this commit; if out-of-hunk anchors turn out to be accepted, the spec's FPRG-19..22 are revisited with the owner before T2 — **done 2026-10-10**: a range from one hunk to another is accepted (S1); the owner chose GitHub's rule, both ends in a hunk, and the head-side fallback to the base repository (S6)

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the github pull request spike findings`

---

### T2: Name a pull request by its provider

**What**: Design N1. `PrTarget` becomes the provider union (the shape of `RemoteRef`); `PrSummary.provider` is dropped for `pr.target.provider`; add `prKey(ref)` and `prLabel(ref)` (`!7` / `#7`) to `pr-view.ts` and use them in `PrPicker.keyOf`, the hook's `refOf` / `sameRef`, the PR tab key (`diff-view.ts:117`) and the Overview header; `prUrl` / `createPrUrl` take the ADO arm; rename `ado-pr:open-link` to `pr:open-link`.
**Where**: `src/shared/files.ts`, `src/shared/ipc-contract.ts`, `src/main/ado-pr.ts`, `src/main/remote-url.ts`, `src/renderer/src/lib/pr-view.ts`, `src/renderer/src/lib/diff-view.ts`, `src/renderer/src/lib/use-pull-request.ts`, `PrPicker.tsx`, `PrOverview.tsx`, `scripts/smoke-files-pr-ado.mjs`
**Depends on**: T1
**Reuses**: `RemoteRef` (`files.ts:218`).
**Requirement**: FPRG-07; edge case "equal numbers on both providers"

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `pr.target.provider` is the only provider field; `grep` finds no `PrSummary.provider` reader left
- [x] `prKey` of ADO `!7` and GitHub `#7` differ; `prLabel` reads `!7` and `#7`
- [x] No `!{` hard-coded label remains in `PrPicker` / `PrOverview`; the F4 smoke's selectors still match (lesson L-053: grep `scripts/` when renaming UI)
- [x] F4 tests pass, edited only where they build a `PrTarget`
- [x] Lint warning baseline recorded in the commit body
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3058 + 2 = **3060**

**Tests**: unit
**Gate**: full
**Commit**: `refactor(files): name a pull request by its provider`

---

### T3: Track a pull request's revision and thread identity neutrally

**What**: Design N2 and N3. `PrDetail.revision: string` (ADO: the iteration as text); `newIterationBanner` becomes `revisionBanner(onScreen: string | null, latest: string)`; `iteration` moves to `PrDetail.ado`, `PrFile.changeTrackingId` becomes optional; `PrThreadView.id: number | string`; `PrThreadView.can?: { reply, resolve, reopen }`.
**Where**: `src/shared/files.ts`, `src/main/ado-pr.ts`, `src/main/ado-pr-model.ts`, `src/renderer/src/lib/pr-view.ts`, `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T2
**Reuses**: F4's banner rule (FPRA-34); lesson L-126 (say what "on screen" means when nothing is shown).
**Requirement**: FPRG-13, 18, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `revisionBanner(null, x)` is false; `(a, a)` false; `(a, b)` true — F4's cases kept as text
- [x] An ADO new thread still carries its iteration and `changeTrackingId` (existing `ado-pr.test.ts` body assertions unedited)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3060 + 1 = **3061**

**Tests**: unit
**Gate**: full
**Commit**: `refactor(files): track a pull request's revision neutrally`

---

### T4: Choose a thread's actions by provider

**What**: Design N4. `ThreadStateIntent`; the hook's `setStatus` becomes `setThreadState(thread, intent)`; `StatusControlProps` takes the intent; `PrThread` reopens and expands by `resolution`; Reply, and the state control, are disabled with a reason when `can` says no.
**Where**: `src/shared/files.ts`, `src/renderer/src/lib/use-pull-request.ts`, `src/renderer/src/components/PrThread.tsx`, `PrDiffTab.tsx`, `PrOverview.tsx`
**Depends on**: T3
**Reuses**: `STATUS_CONTROLS` (`PrThread.tsx:57`); F4's FPRA-26 (cite it when changing its element — lessons L-086, L-096).
**Requirement**: FPRG-17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] An ADO thread's selector offers and sends exactly what F4 did (`ado-pr:status` body unchanged)
- [x] A thread with `can.reply === false` shows Reply disabled with its reason
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3061** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `refactor(renderer): choose a thread's actions by provider`

---

### T5: Keep each provider's search apart

**What**: Design N5. `PrSearch`'s `no-ado-remote` becomes `no-remote`; `rate-limited { resetAt }` joins `PrSearch` and `PrDetailResult`; the hook keeps `searches: Partial<Record<PrProvider, PrSearch>>` (only ADO wired yet); the Overview shows each provider's own state on its own line and names its provider in the sign-in and remote texts.
**Where**: `src/shared/files.ts`, `src/main/ado-pr.ts`, `src/renderer/src/lib/use-pull-request.ts`, `PrOverview.tsx`
**Depends on**: T4
**Reuses**: F4's search states (FPRA-02..08).
**Requirement**: FPRG-04, 07, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] With only ADO remotes, every message reads as F4's, now naming Azure DevOps
- [x] The picker lists the union of `found` results (one provider for now)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3061** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `refactor(renderer): keep each provider's pull request search apart`

---

### T6: Locate a branch's remotes once for every provider

**What**: Design N6. Create `src/main/pr-locate.ts` with `locateBranch(run, worktreePath)` and move F4's private `parseRemoteUrls` into it; `AdoPrClient.locate` filters its result.
**Where**: `src/main/pr-locate.ts`, `src/main/ado-pr.ts`
**Depends on**: T5
**Reuses**: `parseRemote`; the paced `GitRunner` (AD-023).
**Requirement**: FPRG-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Detached HEAD, no tracked remote (`git config` exit 1), a GitHub and an ADO remote side by side, and an unrecognized remote each give the expected result
- [x] `ado-pr.test.ts` passes unedited
- [x] `pr-locate.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 3061 + 4 = **3065**

**Tests**: unit
**Gate**: build
**Commit**: `refactor(main): locate a branch's remotes once for every provider`

---

### T7: Declare the GitHub contract

**What**: Add `GhStatus`, `Hunk`, `GitHubPrFile`, `CommentPlan`, `PrTimelineEntry`, `PrDetail.timeline` / `PrDetail.github`, and extend `ReviewerState` (labels in `REVIEWER_STATES`); register `github:status` and the `github-pr:*` channels mirroring F4's (`thread` = anchored, `comment` = general, `pr: PrRef`).
**Where**: `src/shared/files.ts`, `src/shared/ipc-contract.ts`, `src/renderer/src/components/PrOverview.tsx`
**Depends on**: T6
**Reuses**: The neutral model of T2–T5.
**Requirement**: FPRG-01, 07, 09, 10, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No channel carries a token or a URL; writes carry intent only
- [x] `ReviewerState` is one union for both providers; no second review-state type exists
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3065** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the github pull request contract`

---

### T8: Reach GitHub through gh

**What**: Create `src/main/github-gateway.ts` — `ghStatus()` via `execFile('gh', ['auth', 'token'])` per AD-059 (no shell, `windowsHide`, stdin closed, a timeout), and `rest` / `graphql` request primitives with rate-limit detection; runner and `fetchFn` injected.
**Where**: `src/main/github-gateway.ts`
**Depends on**: T7
**Reuses**: `fetchWithTimeout` (`ado-gateway.ts:263`).
**Requirement**: FPRG-01, 03, 04, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `ENOENT` → `not-installed`; a non-zero exit → `not-signed-in`; success → `ok`, the token kept in memory only
- [x] The token never appears in a returned value, an error message or a log line (asserted over every path)
- [x] Requests send `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`
- [x] A 403 with `x-ratelimit-remaining: 0`, a 429, and a GraphQL `RATE_LIMITED` error each return `rate-limited` with `resetAt`; a 401 drops the token and returns `not-signed-in`
- [x] Nothing throws
- [x] `github-gateway.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3065 + 9 = **3074**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): reach github through the gh cli`

---

### T9: Build GitHub PR and compare URLs

**What**: Add `githubPrUrl(ref, n)` and `githubCompareUrl(target, defaultBranch, sourceOwner, branch)` to `remote-url.ts`.
**Where**: `src/main/remote-url.ts`
**Depends on**: T8
**Reuses**: F3's encoding; AD-044's `isHttpsUrl`.
**Requirement**: FPRG-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `https://github.com/acme/widget/pull/7`
- [x] `https://github.com/acme/widget/compare/main...contoso:feature/x?expand=1`, with a `/` in the branch handled
- [x] Every output passes `isHttpsUrl`
- [x] Gate passes: `npm test`
- [x] Test count: 3074 + 4 = **3078**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): build github pull request and compare urls`

---

### T10: Know which lines are in the diff

**What**: Create `src/shared/pr-diff-rules.ts` with `parsePatchHunks(patch)` and `endsInDiff(startLine, endLine, hunks)`, applying the rule T1 measured: both ends of the range in a hunk (design D2, D3, S1).
**Where**: `src/shared/pr-diff-rules.ts`
**Depends on**: T9
**Reuses**: Nothing — new pure logic.
**Requirement**: FPRG-19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `@@ -10,4 +12,6 @@` → new-side 12–17; `@@ -1 +1 @@` (counts omitted) → 1–1; `@@ -5,3 +4,0 @@` → no new-side lines
- [x] A patch with three hunks yields three ranges in order
- [x] Both ends in one hunk → true; ends in two different hunks (5–30 over hunks 2–8 and 27–33) → true; the line after a hunk (9) → false; one end outside (5–18, 18–30) → false; both ends outside → false
- [x] `null` hunks (no patch) → always false
- [x] `pr-diff-rules.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 3078 + 8 = **3086**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(shared): know which lines of a github pull request are in the diff`

---

### T11: Cite a selection safely

**What**: Add `citation(path, startLine, endLine, text)` to `pr-diff-rules.ts`.
**Where**: `src/shared/pr-diff-rules.ts`
**Depends on**: T10
**Reuses**: Nothing — new pure logic.
**Requirement**: FPRG-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Output starts with `` `src/a.ts:L10–L12` `` and fences the text
- [x] Text containing ` ``` ` is fenced with four backticks; text containing ` ```` ` with five — the quote can never be closed from inside
- [x] A single-line selection reads `:L10`
- [x] Gate passes: `npm test`
- [x] Test count: 3086 + 3 = **3089** (the "renders as one code block" check lives in T17, where the renderer's `renderMarkdown` is importable)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(shared): cite a selection safely in a general comment`

---

### T12: Map threads, reviewers and the timeline

**What**: Create `src/main/github-pr-model.ts` with `toThreadViews`, `reviewerStates` and `timeline`.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T11
**Reuses**: `PrThreadView` (with `can`), the extended `ReviewerState`, `PrTimelineEntry`.
**Requirement**: FPRG-09, 10, 13, 14, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `subjectType: FILE` with `line: 1` → `general` with its path (S4); `isOutdated` with `line: null` → `outdated` on `originalLine` (S5); a one-line thread with `startLine` equal to `line` → one-line `placed`; `isResolved` → `resolution: 'resolved'`; `diffSide LEFT` → left side
- [x] `viewerCanReply / Resolve / Unresolve` carried onto `can`; `rootCommentId` is the first comment's `databaseId`
- [x] Latest review per reviewer wins; a pending own review is excluded; a requested team with no review appears as `no-vote`
- [x] Review bodies and PR comments merge in time order; an empty `COMMENTED` review — the one every comment posted outside a review creates (S2) — adds no entry
- [x] `github-pr-model.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 3089 + 9 = **3098**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): map github threads, reviewers and timeline`

---

### T13: Know the source owner and the GitHub remotes

**What**: Add `sourceOwner(remotes, tracked)` and GitHub-remote selection over `locateBranch`'s result to `github-pr-model.ts`.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T12
**Reuses**: T6's `locateBranch`; F3's `parseRemote`.
**Requirement**: FPRG-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Branch tracking `fork` = `contoso/widget` with `origin` = `acme/widget` → source owner `contoso`, targets both remotes
- [x] A repository with only an ADO remote yields no GitHub targets
- [x] A branch tracking nothing, or tracking an ADO remote, yields no source owner — and so no GitHub search (lesson L-127)
- [x] Gate passes: `npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 3098 + 3 = **3101**

**Tests**: unit
**Gate**: build
**Commit**: `feat(main): find the source owner and github remotes of a branch`

---

### T14: Read a GitHub pull request

**What**: Create `src/main/github-pr.ts` with `GitHubPrClient` and its read methods — `findPrs`, `createTarget`, `getPr`, `files`, `mergeBase`, `fileSide`.
**Where**: `src/main/github-pr.ts`
**Depends on**: T13
**Reuses**: The gateway from T8; the rules from T10–T11; the model from T12–T13.
**Requirement**: FPRG-06, 07, 08, 09, 10, 11, 12, 13, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `findPrs` queries **each** GitHub target with `head=contoso:feature/x&state=open`; no request when the branch tracks no GitHub remote
- [x] `createTarget` returns the parent for a fork, the source otherwise, with its default branch
- [x] `getPr` pages every GraphQL connection to `hasNextPage: false` — a 150-thread fake yields 150 threads (lesson L-128)
- [x] `files` pages to the end, keeps `patch` as parsed hunks, and flags the 3000-file ceiling
- [x] `mergeBase` uses the form T1 confirmed
- [x] `fileSide` reads the head side from the **head** repository, then from the base repository at the same commit when the fork is gone (S6), and returns unavailable only when both fail; it strips the base64 line breaks (S7), rejects a folder's array, and never decodes content above 1 MB or for a binary
- [x] **No read method issues POST, PATCH, PUT or DELETE, and no GraphQL mutation** — asserted over every read test
- [x] `github-pr.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3101 + 10 = **3111**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read github pull requests`

---

### T15: Write GitHub review comments

**What**: Add `reply`, `setResolved`, `anchoredComment` and `generalComment` to `GitHubPrClient`.
**Where**: `src/main/github-pr.ts`
**Depends on**: T14
**Reuses**: REST for the three posts, GraphQL for resolve (design D1).
**Requirement**: FPRG-16, 17, 19, 21, 23, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `reply` posts to `…/pulls/{n}/comments/{rootId}/replies`
- [x] `setResolved` sends `resolveReviewThread` or `unresolveReviewThread` with the thread's node id
- [x] `anchoredComment` sends `commit_id` (the head sha), `path`, `line`, `side: RIGHT`, and `start_line` / `start_side` for a range — never `position`
- [x] `generalComment` posts to `…/issues/{n}/comments`
- [x] Each write issues exactly one request, only when called; a 422 or 403 returns GitHub's message
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3111 + 5 = **3116**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): write github review comments`

---

### T16: Serve the GitHub channels

**What**: Register `github:status` (answering `no-github-remote` when no registered repository has one) and the `github-pr:*` handlers in `index.ts`; `github-pr:open` builds the URL in main and re-checks `isHttpsUrl` before `shell.openExternal`.
**Where**: `src/main/index.ts`
**Depends on**: T15
**Reuses**: `handle()`; F4's opener pattern (`openPrLink`, `ado-pr.ts:560`).
**Requirement**: FPRG-02, 06, 08, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Every handler delegates; no token reaches the renderer
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3116** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(main): serve the github pull request channels`

---

### T17: Decide anchored or general

**What**: Add `commentPlan(pr, file, selection)` to `pr-view.ts` — `anchored` for an ADO PR or a GitHub selection whose both ends lie in a hunk; `general` with the banner text and the citation otherwise.
**Where**: `src/renderer/src/lib/pr-view.ts`
**Depends on**: T16
**Reuses**: `endsInDiff` and `citation` from `shared/pr-diff-rules.ts` (D3); `renderMarkdown`.
**Requirement**: FPRG-19, 20, 21, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] An ADO PR is always `anchored` — F4's behaviour unchanged
- [x] GitHub with both ends in a hunk, the same or two different → `anchored`; an end outside every hunk, or no patch → `general`
- [x] The banner names `path:Lstart–Lend` and says GitHub only anchors comments to diff lines
- [x] The citation of a selection containing ` ``` ` renders through `renderMarkdown` as one code block and no live content
- [x] Gate passes: `npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 3116 + 6 = **3122**

**Tests**: unit
**Gate**: build
**Commit**: `feat(renderer): decide whether a comment is anchored or general`

---

### T18: Track gh's state

**What**: Create `src/renderer/src/lib/use-github-status.ts` — `github:status` on mount and on focus (5 s debounce), hidden on `no-github-remote`.
**Where**: `src/renderer/src/lib/use-github-status.ts`
**Depends on**: T17
**Reuses**: `FOCUS_RELOAD_MS` (`use-pull-request.ts:23`).
**Requirement**: FPRG-02, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No `gh` process when no registered repository has a GitHub remote
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): track the gh cli state`

---

### T19: Show the gh chip

**What**: Add the `gh` chip beside `az` in the TopBar through a new prop — `not installed` with the install link, `not signed in`, signed in.
**Where**: `src/renderer/src/components/TopBar.tsx`, `src/renderer/src/App.tsx`
**Depends on**: T18
**Reuses**: The `az` chip (`TopBar.tsx:31-37`, `:159-160`); `pr:open-link`.
**Requirement**: FPRG-02, 03, 04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The three states read differently in both themes
- [ ] The install link opens through main, never through the template's window-open handler
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show the gh chip in the top bar`

---

### T20: Search both providers

**What**: Wire `github-pr:find` into the hook's `searches` beside ADO's, in parallel, and route every later call by `pr.target.provider`.
**Where**: `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T19
**Reuses**: T5's per-provider state.
**Requirement**: FPRG-04, 07, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A provider that fails shows its own state without hiding the other's PRs
- [ ] Choosing a PR of one provider does not reset the other's cache (edge case)
- [ ] A rate-limited GitHub shows its reset time and is not retried until the next user-driven reload
- [ ] F4's ADO-only behaviour is unchanged when no GitHub remote exists
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): search pull requests on both providers`

---

### T21: Mark each PR's provider

**What**: Add a provider glyph per PR to `PrPicker`.
**Where**: `src/renderer/src/components/PrPicker.tsx`
**Depends on**: T20
**Reuses**: F4's picker; `prLabel`.
**Requirement**: FPRG-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] ADO and GitHub PRs of one branch are distinguishable at a glance
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): mark each pull request with its provider`

---

### T22: Show GitHub reviews in the Overview

**What**: In `PrOverview`, show each reviewer's state (GitHub's included), requested reviewers and teams without a review, and the timeline in General — author, review state when any, text, no buttons (D4).
**Where**: `src/renderer/src/components/PrOverview.tsx`
**Depends on**: T21
**Reuses**: `reviewerStates` / `timeline` output; `MarkdownBody`; F4's layout.
**Requirement**: FPRG-09, 10, 14, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Outdated GitHub threads are listed as outdated
- [ ] An approval with no body shows its state and no empty comment
- [ ] Timeline entries carry no Reply or Resolve
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show github reviews in the pull request overview`

---

### T23: Resolve and reopen GitHub threads

**What**: Add GitHub's entry to `STATUS_CONTROLS` — a Resolve / Reopen toggle sending T4's intent, disabled with the reason when `can` says no.
**Where**: `src/renderer/src/components/PrThread.tsx`
**Depends on**: T22
**Reuses**: T4's `ThreadStateIntent` and permission gate.
**Requirement**: FPRG-16, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] ADO threads still show the status selector
- [ ] A thread the viewer cannot resolve shows the toggle disabled with the reason; the toggle reads `can.resolve` on an active thread and `can.reopen` on a resolved one, never the other (S4)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): resolve and reopen github threads`

---

### T24: Tell the user a comment will be general

**What**: In `CommentComposer`, when the plan is `general`, show the banner above the editor and the citation in Preview exactly as it will post.
**Where**: `src/renderer/src/components/CommentComposer.tsx`
**Depends on**: T23
**Reuses**: `commentPlan`; F4's Preview.
**Requirement**: FPRG-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The banner is visible before the first keystroke, not only after posting
- [ ] Preview shows citation + text as one rendered comment
- [ ] Anchored plans look exactly as in F4
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): warn when a comment will post as a general one`

---

### T25: Comment from a GitHub PR diff

**What**: In `PrDiffTab`, compute `commentPlan` for each modified-side selection and send the anchored (`github-pr:thread`) or general (`github-pr:comment`) write accordingly; read GitHub sides through `github-pr:file-sides`.
**Where**: `src/renderer/src/components/PrDiffTab.tsx`, `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T24
**Reuses**: F4's selection → composer flow, the always-mounted Comment bar and the ZoneWidget threads (`DiffViewer.tsx:60-68`).
**Requirement**: FPRG-12, 13, 19, 20, 21, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A selection in an expanded unchanged region opens the composer with the general banner
- [ ] A file without a patch never offers an anchored comment
- [ ] A fork PR whose fork is gone still shows its head side, read from the base repository; "head repository unavailable" appears on the head side only when that read fails too
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): comment from a github pull request diff`

---

### T26: Widen the recorded write posture to GitHub

**What**: Amend the README's write-posture sentence (`README.md:136-138`, F4 T26) so it names GitHub alongside Azure DevOps and widens "a thread's status" to cover GitHub's resolve / reopen. **AD-027 already names both providers** — this task adds no AD.
**Where**: `README.md`
**Depends on**: T25
**Reuses**: F4 T26's wording; AD-027.
**Requirement**: FPRG-24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] README names both providers and exactly the four writes
- [ ] `.specs/STATE.md` gains **no new AD**; AD-027 is amended in place only if what shipped differs from it
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **3122** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `docs: record that the app writes github review comments too`

---

### T27: Drive GitHub pull requests end to end

**What**: Create `scripts/smoke-files-pr-github.mjs` from F4's harness — read-only by default; writes only with `--allow-writes`, on the owner's fork PR, deleting what it created.
**Where**: `scripts/smoke-files-pr-github.mjs`
**Depends on**: T26
**Reuses**: `scripts/smoke-files-pr-ado.mjs` (env coordinates, throwaway `--user-data-dir`, numbered `check()` / `skip()`, run marker, `finally` cleanup), with `gh auth token` and `api.github.com` in place of `az`.
**Requirement**: FPRG-01..26 end to end; the sole evidence for 02, 05, 15, 16, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Refuses `--allow-writes` when the PR's base repository is `obogoni/playground`, and when the PR is not a draft
- [ ] Read checks: the chip; the fork → upstream PR found; the provider glyph; reviewer states; the timeline without buttons; outdated listed; resolved collapsed; a comment with a `javascript:` link inert
- [ ] With `--allow-writes`: reply; resolve and reopen; an anchored comment inside a hunk landing on its lines on github.com; a selection outside the diff showing the banner and posting a general comment with the citation — all deleted afterwards
- [ ] Coordinates from environment variables only
- [ ] Each check falsified once against a broken build before it is trusted (lessons L-031, L-052, L-073)
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive github pull requests end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1   (owner-gated stop point)
Phase 2:  T2 → T3 → T4 → T5 → T6
Phase 3:  T7 → T8 → T9 → T10 → T11 → T12 → T13
Phase 4:  T14 → T15 → T16 → T17
Phase 5:  T18 → T19 → T20 → T21 → T22 → T23 → T24 → T25
Phase 6:  T26 → T27
```

Strictly sequential. **T1 runs inline with the owner**, before any batch. **Packing** (whole phases): Phase 2 (5) = batch 1; Phase 3 (7) = batch 2; Phase 4 (4) = batch 3; Phase 5 (8) = batch 4; T26 = batch 5; **T27 inline**, since its write mode needs the owner's go-ahead. 27 tasks > 8, so the sub-agent offer applies — offer-then-confirm.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 findings section | ✅ |
| T2 | 1 type change through its readers | ⚠️ cohesive — one type, many readers; typecheck drives it |
| T3 | 2 type changes on one concept (what a PR and a thread are named by) | ⚠️ cohesive |
| T4 | 1 intent through hook and component | ✅ |
| T5 | 1 state shape through hook and Overview | ✅ |
| T6 | 1 extracted module | ✅ |
| T7 | 1 types file + contract | ✅ |
| T8 | 1 gateway module | ⚠️ cohesive — status and request primitives share the token |
| T9 | 2 URL builders | ✅ |
| T10 | 2 pure functions on one concept | ✅ |
| T11 | 1 pure function | ✅ |
| T12 | 3 pure mappers | ⚠️ cohesive — all map one GraphQL response |
| T13 | 1–2 pure functions | ✅ |
| T14 | 1 client, read side | ⚠️ cohesive — one class, one side |
| T15 | 1 client, write side | ✅ |
| T16 | 1 wiring file | ✅ |
| T17 | 1 pure function | ✅ |
| T18–T25 | 1 hook / component each | ✅ |
| T26 | 1 doc | ✅ |
| T27 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows | Status |
| ---- | ---------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 (boundary) | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 (boundary) | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 (boundary) | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 (boundary) | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | T21 | T21 → T22 | ✅ |
| T23 | T22 | T22 → T23 | ✅ |
| T24 | T23 | T23 → T24 | ✅ |
| T25 | T24 | T24 → T25 | ✅ |
| T26 | T25 | T25 → T26 (boundary) | ✅ |
| T27 | T26 | T26 → T27 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2, T3 | F4 neutralization with pure helpers | existing + unit | unit | ✅ |
| T4, T5 | F4 neutralization, renderer only | existing | none | ✅ |
| T6 | Pure main module | unit | unit | ✅ |
| T7 | Shared types + contract | none | none | ✅ |
| T8 | Gateway | unit | unit | ✅ |
| T9–T13 | Pure modules | unit | unit | ✅ |
| T14, T15 | DI client | unit | unit | ✅ |
| T16 | Thin Electron shell | none | none | ✅ |
| T17 | Pure renderer helper | unit | unit | ✅ |
| T18–T25 | Renderer hooks / components | none | none | ✅ |
| T26 | Docs | none | none | ✅ |
| T27 | Smoke | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FPRG-01 | T7, T8 |
| FPRG-02 | T16, T18, T19, T27 |
| FPRG-03 | T8, T19 |
| FPRG-04 | T5, T8, T19, T20 |
| FPRG-05 | T18, T27 |
| FPRG-06 | T6, T13, T14, T16 |
| FPRG-07 | T2, T5, T7, T14, T20, T21 |
| FPRG-08 | T9, T14, T16 |
| FPRG-09 | T7, T12, T14, T22 |
| FPRG-10 | T7, T12, T14, T22 |
| FPRG-11 | T14 |
| FPRG-12 | T1, T14, T25 |
| FPRG-13 | T3, T12, T14, T25 |
| FPRG-14 | T12, T14, T22 |
| FPRG-15 | T22, T27 |
| FPRG-16 | T15, T23, T27 |
| FPRG-17 | T4, T12, T15, T23 |
| FPRG-18 | T3, T4, T12, T23 |
| FPRG-19 | T1, T7, T10, T15, T17, T25 |
| FPRG-20 | T1, T10, T11, T17, T24, T25 |
| FPRG-21 | T11, T15, T17, T24, T25 |
| FPRG-22 | T1, T10, T17, T25 |
| FPRG-23 | T15 |
| FPRG-24 | T15, T16, T26 |
| FPRG-25 | T3, T20, T27 |
| FPRG-26 | T5, T8, T20 |

All 26 mapped; none unmapped.

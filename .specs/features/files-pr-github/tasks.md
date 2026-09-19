# Files Direction — GitHub Pull Requests (F5) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-pr-github/design.md`
**Status**: Draft

**Branch**: `feature/files-pr-github`, stacked on `feature/files-pr-ado`. Once F4 merges, `git rebase --onto origin/main feature/files-pr-ado feature/files-pr-github`.

**Prerequisite**: F4 executed **with its F5-Spec amendments** (provider-neutral model in T3, provider-chosen status control in T19). If F4 shipped without them, stop and add a refactor task before T15.

**Test baseline**: **1015** — F4's projected end (**1019** if F4's conditional T25 was kept), resting on a chain of projections back to `origin/main`'s recorded 748. **Re-measure with `npm test` as the first act of Execute** and re-anchor every count below.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes **1184** (**1188** if F4's T25 was kept); every count below shifts by **+169** and this feature ends at **1239** (**1243**), not 1070. Still re-measure as the first act of Execute.

**Outward writes**: T1 and T22's `--allow-writes` mode write to GitHub. Both run **only on a scratch repository the owner names, with the owner's explicit go-ahead at that moment**. **Never against this repository's upstream (`obogoni/playground`), whose PRs notify real maintainers.** Every client test uses a fake `fetch` and a fake `gh` runner.

**Privacy guardrail**: fixtures and tests use fictitious owners and repositories (`acme/widget`, fork owner `contoso`).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Gateway (`github-gateway.ts`) | unit (fake runner + fake `fetch`) | Every `gh` exit path; rate-limit detection in REST and GraphQL; headers | `src/main/github-gateway.test.ts` | `npm test` |
| DI client (`github-pr.ts`) | unit (fake `fetch`) | Exact URLs and bodies; every pagination to its end; head side from the head repository; no write on a read path | `src/main/github-pr.test.ts` | `npm test` |
| Pure modules (`github-pr-model.ts`, `remote-url.ts` additions, `pr-view.ts` `commentPlan`) | unit | 1:1 to the ACs each decides, every edge case | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts`) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hooks | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-pr-github.mjs` |
| Docs | none | — | — | review |
| Spike findings | manual | Each **[spike]** item in the design | `design.md` § Spike Findings | by hand |
| Out-of-CI smoke | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-pr-github.mjs` (scratch repository) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | T1 and T22 | by hand / `node scripts/smoke-files-pr-github.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T2 and diff it at every gate.

---

## Execution Plan

### Phase 1: Measure GitHub on a scratch repository

```
T1
```

**Owner-gated stop point.** Its findings may change the design; if they do, the design is amended in T1's commit and later phases re-checked before T2.

### Phase 2: Pure foundations

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 3: The client and its wiring

```
T8 → T9 → T10 → T11
```

### Phase 4: The comment plan

```
T11 → T12
```

### Phase 5: GitHub in the Pull request mode

```
T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 6: Close the loop

```
T20 → T21 → T22
```

---

## Task Breakdown

### T1: Measure what the reference left open

**What**: On a scratch repository and PR the owner names — with a fork PR among them — and with the owner's go-ahead at that moment, measure the design's **[spike]** items and record them in `design.md` under **Spike Findings**, fictitious names only.
**Where**: `.specs/features/files-pr-github/design.md`
**Depends on**: None
**Reuses**: `gh api` from a scratch script outside the repository.
**Requirement**: FPRG-12, 19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] **Out-of-hunk anchors**: an anchored comment inside a hunk, one on a context line outside every hunk, and one spanning two hunks — recorded which GitHub accepts and the exact error of the others (the spec's open question)
- [ ] **Immediate posting**: the REST anchored comment and reply appear to another account without submitting a review
- [ ] **Merge base on a fork PR**: `compare/{baseSha}...{headSha}` in the base repository with the fork's head sha — recorded whether it resolves; if not, the `{headOwner}:{headRef}` form
- [ ] Every probe comment is deleted afterwards
- [ ] **Nothing is posted to `obogoni/playground`**
- [ ] If a finding contradicts the design, it is amended in this commit; if out-of-hunk anchors turn out to be accepted, the spec's FPRG-19..22 are revisited with the owner before T2

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the github pull request spike findings`

---

### T2: Declare the GitHub contract

**What**: Add `GhStatus`, `Hunk`, `GitHubPrFile`, `CommentPlan` and `NeutralReviewState` to `src/shared/files.ts`; register `github:status` and the `github-pr:*` channels.
**Where**: `src/shared/files.ts`
**Depends on**: T1
**Reuses**: F4's amended, provider-neutral model.
**Requirement**: FPRG-01, 07, 09, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No channel carries a token or a URL; writes carry intent only
- [ ] ADO votes and GitHub review states both map onto `NeutralReviewState` (checked by typing F4's `voteLabel` against it)
- [ ] Lint warning baseline recorded in the commit body
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the github pull request contract`

---

### T3: Reach GitHub through gh

**What**: Create `src/main/github-gateway.ts` — `ghStatus()` via `execFile('gh', ['auth', 'token'])` with no shell, and `rest` / `graphql` request primitives with rate-limit detection; runner and `fetchFn` injected.
**Where**: `src/main/github-gateway.ts`
**Depends on**: T2
**Reuses**: `fetchWithTimeout` from `ado-gateway.ts`.
**Requirement**: FPRG-01, 03, 04, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `ENOENT` → `not-installed`; a non-zero exit → `not-signed-in`; success → `ok`, the token kept in memory only
- [ ] The token never appears in a returned value, an error message or a log line (asserted over every path)
- [ ] Requests send `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`
- [ ] A 403 with `x-ratelimit-remaining: 0`, a 429, and a GraphQL `RATE_LIMITED` error each return `rate-limited` with `resetAt`
- [ ] Nothing throws
- [ ] `github-gateway.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 1015 + 8 = **1023**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): reach github through the gh cli`

---

### T4: Build GitHub PR and compare URLs

**What**: Add `githubPrUrl(ref, n)` and `githubCompareUrl(target, defaultBranch, sourceOwner, branch)` to `remote-url.ts`.
**Where**: `src/main/remote-url.ts`
**Depends on**: T3
**Reuses**: F3's encoding; F4's `isOpenableLink`.
**Requirement**: FPRG-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `https://github.com/acme/widget/pull/7`
- [ ] `https://github.com/acme/widget/compare/main...contoso:feature/x?expand=1`, with a `/` in the branch handled
- [ ] Every output passes `isOpenableLink`
- [ ] Gate passes: `npm test`
- [ ] Test count: 1023 + 4 = **1027**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): build github pull request and compare urls`

---

### T5: Know which lines are in the diff

**What**: Create `src/main/github-pr-model.ts` with `parsePatchHunks(patch)` and `inOneHunk(selection, hunks)`, applying the rule T1 confirmed.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T4
**Reuses**: Nothing — new pure logic.
**Requirement**: FPRG-19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `@@ -10,4 +12,6 @@` → new-side 12–17; `@@ -1 +1 @@` (counts omitted) → 1–1; `@@ -5,3 +4,0 @@` → no new-side lines
- [ ] A patch with three hunks yields three ranges in order
- [ ] A selection inside one hunk → true; across two hunks → false; on a line in no hunk → false
- [ ] `null` hunks (no patch) → always false
- [ ] `github-pr-model.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 1027 + 8 = **1035**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): know which lines of a github pull request are in the diff`

---

### T6: Cite a selection safely

**What**: Add `citation(path, startLine, endLine, text)` to `github-pr-model.ts`.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T5
**Reuses**: Nothing — new pure logic.
**Requirement**: FPRG-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Output starts with `` `src/a.ts:L10–L12` `` and fences the text
- [ ] Text containing ` ``` ` is fenced with four backticks; text containing ` ```` ` with five — the quote can never be closed from inside
- [ ] A single-line selection reads `:L10`
- [ ] Rendering the output through F4's `renderMarkdown` yields one code block and no live content
- [ ] Gate passes: `npm test`
- [ ] Test count: 1035 + 4 = **1039**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): cite a selection safely in a general comment`

---

### T7: Map threads, reviewers and the timeline

**What**: Add `toThreadViews`, `reviewerStates` and `timeline` to `github-pr-model.ts`.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T6
**Reuses**: F4's amended `PrThreadView`; `NeutralReviewState`.
**Requirement**: FPRG-09, 10, 13, 14, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `isOutdated` → outdated place; `isResolved` → `resolution: 'resolved'`; `diffSide LEFT` → left side
- [ ] `viewerCanReply / Resolve / Unresolve` carried onto the view
- [ ] Latest review per reviewer wins; a pending own review is excluded; a requested team with no review appears as `no-response`
- [ ] Review bodies and PR comments merge in time order; an empty review body adds no entry
- [ ] Gate passes: `npm test`
- [ ] Test count: 1039 + 8 = **1047**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): map github threads, reviewers and timeline`

---

### T8: Know the source owner and the GitHub remotes

**What**: Add `sourceOwner(remotes, branchConfig)` and GitHub-remote selection to `github-pr-model.ts`.
**Where**: `src/main/github-pr-model.ts`
**Depends on**: T7
**Reuses**: F3's `parseRemote`.
**Requirement**: FPRG-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Branch pushed to `fork` = `contoso/widget` with `origin` = `acme/widget` → source owner `contoso`, targets both remotes
- [ ] A repository with only an ADO remote yields no GitHub targets
- [ ] A branch with no upstream yields no source owner
- [ ] Gate passes: `npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: 1047 + 3 = **1050**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): find the source owner and github remotes of a branch`

---

### T9: Read a GitHub pull request

**What**: Create `src/main/github-pr.ts` with `GitHubPrClient` and its read methods — `findPrs`, `createTarget`, `getPr`, `files`, `mergeBase`, `fileSide`.
**Where**: `src/main/github-pr.ts`
**Depends on**: T8
**Reuses**: The gateway from T3; the model from T5–T8.
**Requirement**: FPRG-06, 07, 08, 09, 10, 11, 12, 13, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `findPrs` queries **each** GitHub target with `head=contoso:feature/x&state=open`
- [ ] `createTarget` returns the parent for a fork, the source otherwise, with its default branch
- [ ] `getPr` pages every GraphQL connection to `hasNextPage: false` — a 150-thread fake yields 150 threads
- [ ] `files` pages to the end, keeps `patch`, and flags the 3000-file ceiling
- [ ] `mergeBase` uses the form T1 confirmed
- [ ] `fileSide` reads the head side from the **head** repository, returns unavailable when the fork is gone, and never decodes content above 1 MB or for a binary
- [ ] **No read method issues POST, PATCH, PUT or DELETE, and no GraphQL mutation** — asserted over every read test
- [ ] `github-pr.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 1050 + 10 = **1060**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read github pull requests`

---

### T10: Write GitHub review comments

**What**: Add `reply`, `setResolved`, `anchoredComment` and `generalComment` to `GitHubPrClient`.
**Where**: `src/main/github-pr.ts`
**Depends on**: T9
**Reuses**: REST for the three posts, GraphQL for resolve (design D1).
**Requirement**: FPRG-16, 17, 19, 21, 23, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `reply` posts to `…/pulls/{n}/comments/{rootId}/replies`
- [ ] `setResolved` sends `resolveReviewThread` or `unresolveReviewThread` with the thread's node id
- [ ] `anchoredComment` sends `commit_id` (the head sha), `path`, `line`, `side: RIGHT`, and `start_line` / `start_side` for a range — never `position`
- [ ] `generalComment` posts to `…/issues/{n}/comments`
- [ ] Each write issues exactly one request, only when called; a 422 or 403 returns GitHub's message
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 1060 + 5 = **1065**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): write github review comments`

---

### T11: Serve the GitHub channels

**What**: Register `github:status` and the `github-pr:*` handlers in `index.ts`; `github-pr:open` re-checks `isOpenableLink` before `shell.openExternal`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: `handle()`; F4's opener pattern.
**Requirement**: FPRG-02, 06, 08, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Every handler delegates; no token reaches the renderer
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **1065** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the github pull request channels`

---

### T12: Decide anchored or general

**What**: Add `commentPlan(pr, file, selection)` to F4's `pr-view.ts` — `anchored` for an ADO PR or a GitHub selection inside one hunk; `general` with the banner text and the citation otherwise.
**Where**: `src/renderer/src/lib/pr-view.ts`
**Depends on**: T11
**Reuses**: `inOneHunk` and `citation` semantics (the renderer receives the hunks and the plan inputs, not the rule's duplicate).
**Requirement**: FPRG-19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] An ADO PR is always `anchored` — F4's behaviour unchanged
- [ ] GitHub inside one hunk → `anchored`; across hunks, outside, or no patch → `general`
- [ ] The banner names `path:Lstart–Lend` and says GitHub only anchors comments to diff lines
- [ ] Gate passes: `npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: 1065 + 5 = **1070**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide whether a comment is anchored or general`

---

### T13: Track gh's state

**What**: Create `src/renderer/src/lib/use-github-status.ts` — `github:status` on mount and on focus (5 s debounce), exposed only while a registered repository has a GitHub remote.
**Where**: `src/renderer/src/lib/use-github-status.ts`
**Depends on**: T12
**Reuses**: The `App.tsx:165` debounce pattern.
**Requirement**: FPRG-02, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No request when no registered repository has a GitHub remote
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): track the gh cli state`

---

### T14: Show the gh chip

**What**: Add the `gh` chip beside `az` in the TopBar — `not installed` with the install link, `not signed in`, signed in.
**Where**: `src/renderer/src/components/TopBar.tsx`
**Depends on**: T13
**Reuses**: The `az` chip (`TopBar.tsx:32`); the https-only opener.
**Requirement**: FPRG-02, 03, 04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The three states read differently in both themes
- [ ] The install link opens through main, never through the template's window-open handler
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show the gh chip in the top bar`

---

### T15: Search both providers

**What**: Extend F4's `use-pull-request.ts` to call `ado-pr:find` and `github-pr:find` in parallel, merge the results, route later calls by `pr.provider`, and keep a cache per provider.
**Where**: `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T14
**Reuses**: F4's hook.
**Requirement**: FPRG-04, 07, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A provider that fails shows its own state without hiding the other's PRs
- [ ] Choosing a PR of one provider does not reset the other's cache (edge case)
- [ ] F4's ADO-only behaviour is unchanged when no GitHub remote exists
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): search pull requests on both providers`

---

### T16: Mark each PR's provider

**What**: Add a provider glyph per PR to F4's `PrPicker`.
**Where**: `src/renderer/src/components/PrPicker.tsx`
**Depends on**: T15
**Reuses**: F4's picker.
**Requirement**: FPRG-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] ADO and GitHub PRs of one branch are distinguishable at a glance
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): mark each pull request with its provider`

---

### T17: Show GitHub reviews in the Overview

**What**: In F4's `PrOverview`, show each reviewer's neutral state, requested reviewers and teams without a review, and the review-body timeline for GitHub PRs.
**Where**: `src/renderer/src/components/PrOverview.tsx`
**Depends on**: T16
**Reuses**: `reviewerStates` / `timeline` output; F4's layout.
**Requirement**: FPRG-09, 10, 14, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Outdated GitHub threads are listed as outdated
- [ ] An approval with no body shows its state and no empty comment
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show github reviews in the pull request overview`

---

### T18: Resolve and reopen GitHub threads

**What**: Plug the GitHub action into F4's `PrThread` — a Resolve / Reopen toggle, and every action disabled with a reason when GitHub says the viewer may not perform it.
**Where**: `src/renderer/src/components/PrThread.tsx`
**Depends on**: T17
**Reuses**: F4's provider-chosen status control (F4 T19 as amended).
**Requirement**: FPRG-16, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] ADO threads still show the status selector
- [ ] A thread the viewer cannot resolve shows the toggle disabled with the reason
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): resolve and reopen github threads`

---

### T19: Tell the user a comment will be general

**What**: In F4's `CommentComposer`, when the plan is `general`, show the banner above the editor and the citation in Preview exactly as it will post.
**Where**: `src/renderer/src/components/CommentComposer.tsx`
**Depends on**: T18
**Reuses**: `commentPlan`; F4's Preview.
**Requirement**: FPRG-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The banner is visible before the first keystroke, not only after posting
- [ ] Preview shows citation + text as one rendered comment
- [ ] Anchored plans look exactly as in F4
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): warn when a comment will post as a general one`

---

### T20: Comment from a GitHub PR diff

**What**: In F4's `PrDiffTab`, compute `commentPlan` for each modified-side selection and send the anchored or general write accordingly.
**Where**: `src/renderer/src/components/PrDiffTab.tsx`
**Depends on**: T19
**Reuses**: F4's selection → composer flow.
**Requirement**: FPRG-12, 13, 19, 20, 21, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A selection in an expanded unchanged region opens the composer with the general banner
- [ ] A file without a patch never offers an anchored comment
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): comment from a github pull request diff`

---

### T21: Widen the recorded write posture to GitHub

**What**: Amend the README's write-posture sentence (F4 T26) and the AD F4 appended to `.specs/STATE.md` so both name GitHub alongside Azure DevOps.
**Where**: `README.md`
**Depends on**: T20
**Reuses**: F4 T26's wording.
**Requirement**: FPRG-24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] README names both providers and exactly the four writes
- [ ] The AD is amended in place, not duplicated, with the date of the amendment
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1070** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `docs: record that the app writes github review comments too`

---

### T22: Drive GitHub pull requests end to end

**What**: Create `scripts/smoke-files-pr-github.mjs` against the owner's scratch repository and fork PR — read-only by default; writes only with `--allow-writes`, deleting what it created.
**Where**: `scripts/smoke-files-pr-github.mjs`
**Depends on**: T21
**Reuses**: F4's smoke harness.
**Requirement**: FPRG-01..26 end to end; the sole evidence for 02, 05, 15, 16, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Refuses to start if the configured repository is `obogoni/playground`
- [ ] Read checks: the chip; the fork PR found; the provider glyph; reviewer states; outdated listed; resolved collapsed; a comment with a `javascript:` link inert
- [ ] With `--allow-writes`: reply; resolve and reopen; an anchored comment inside a hunk landing on its lines on github.com; a selection outside the diff showing the banner and posting a general comment with the citation — all deleted afterwards
- [ ] Coordinates from environment variables only
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive github pull requests end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1   (owner-gated stop point)
Phase 2:  T2 → T3 → T4 → T5 → T6 → T7 → T8
Phase 3:  T9 → T10 → T11
Phase 4:  T12
Phase 5:  T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20
Phase 6:  T21 → T22
```

Strictly sequential. **T1 runs inline with the owner**, before any batch. **Packing** (~7 per batch, whole phases): Phase 2 (7) = batch 1; Phases 3 + 4 (3 + 1) = batch 2; Phase 5 (8) = batch 3; Phase 6 (2) = batch 4. 22 tasks > 8, so the sub-agent offer applies — offer-then-confirm.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 findings section | ✅ |
| T2 | 1 types file + contract | ✅ |
| T3 | 1 gateway module | ⚠️ cohesive — status and request primitives share the token |
| T4 | 2 URL builders | ✅ |
| T5 | 2 pure functions on one concept | ✅ |
| T6 | 1 pure function | ✅ |
| T7 | 3 pure mappers | ⚠️ cohesive — all map one GraphQL response |
| T8 | 1–2 pure functions | ✅ |
| T9 | 1 client, read side | ⚠️ cohesive — one class, one side |
| T10 | 1 client, write side | ✅ |
| T11 | 1 wiring file | ✅ |
| T12 | 1 pure function | ✅ |
| T13–T20 | 1 hook / component each | ✅ |
| T21 | 1 doc + 1 decision row | ✅ |
| T22 | 1 script | ✅ |

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
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 (boundary) | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 (boundary) | ✅ |
| T13 | T12 | T12 → T13 (boundary) | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 (boundary) | ✅ |
| T22 | T21 | T21 → T22 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2 | Shared types + contract | none | none | ✅ |
| T3 | Gateway | unit | unit | ✅ |
| T4–T8 | Pure modules | unit | unit | ✅ |
| T9, T10 | DI client | unit | unit | ✅ |
| T11 | Thin Electron shell | none | none | ✅ |
| T12 | Pure renderer helper | unit | unit | ✅ |
| T13–T20 | Renderer hooks / components | none | none | ✅ |
| T21 | Docs | none | none | ✅ |
| T22 | Smoke | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FPRG-01 | T2, T3 |
| FPRG-02 | T11, T13, T14, T22 |
| FPRG-03 | T3, T14 |
| FPRG-04 | T3, T14, T15 |
| FPRG-05 | T13, T22 |
| FPRG-06 | T8, T9, T11 |
| FPRG-07 | T2, T9, T15, T16 |
| FPRG-08 | T4, T9, T11 |
| FPRG-09 | T2, T7, T9, T17 |
| FPRG-10 | T7, T9, T17 |
| FPRG-11 | T9 |
| FPRG-12 | T1, T9, T20 |
| FPRG-13 | T7, T9, T20 |
| FPRG-14 | T7, T9, T17 |
| FPRG-15 | T17, T22 |
| FPRG-16 | T10, T18, T22 |
| FPRG-17 | T7, T10, T18 |
| FPRG-18 | T7, T18 |
| FPRG-19 | T1, T2, T5, T10, T12, T20 |
| FPRG-20 | T1, T5, T6, T12, T19, T20 |
| FPRG-21 | T6, T10, T19, T20 |
| FPRG-22 | T1, T5, T12, T20 |
| FPRG-23 | T10 |
| FPRG-24 | T10, T11, T21 |
| FPRG-25 | T15, T22 |
| FPRG-26 | T3 |

All 26 mapped; none unmapped.

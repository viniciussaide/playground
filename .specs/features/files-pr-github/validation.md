## Validation: files-pr-github — PASS

Independent Verifier (author ≠ verifier), one pass. No production defect found, and every one of
FPRG-01..26 has evidence. Two unit mutants survived on correct production code (test gaps), and two
ACs — FPRG-18 and FPRG-26 — rest on unit tests of their rule plus code reading of the renderer, where
the smoke cannot reach them; all are follow-ups, not blockers, under the owner's rules for this
Verifier.

**Date**: 2026-10-10
**Spec**: `.specs/features/files-pr-github/spec.md` (FPRG-01..26; FPRG-07, the "Both providers" assumption, an edge case and a success criterion as amended in `e844998`)
**Design**: `.specs/features/files-pr-github/design.md` — § Reconciliation N1–N6 and § Spike Findings S1–S8 taken as overriding the earlier text
**Branch**: `feature/files-pr-github`, HEAD `e844998`, stacked on `feature/files-pr-ado` (`f837489`)
**Diff range**: `f837489..e844998` — 33 commits: the plan, T1 findings, T2–T27, the two smoke-found fixes and the FPRG-07 amendment
**Verifier**: independent sub-agent; read-only on the real worktree, mutants and smoke runs in a throwaway `git worktree`

---

## Summary

| Measure | Outcome |
| ------- | ------- |
| Spec-anchored check | 26/26 ACs with evidence — 22 by unit test and/or smoke check; FPRG-02, 18, 24, 26 partly by code reading where neither reaches (each named below); 4 spec-precision gaps flagged |
| Gate | `npm test` 3122 passed / 0 failed (141 files, 169.6 s); typecheck exit 0; lint exit 0, **18 warnings** (= the T2 baseline); `npx electron-vite build` exit 0 |
| Sensor, unit | 23/25 killed — U11 and U25 survived |
| Sensor, smoke (read-only) | 4/4 killed, each by exactly the check that names its behaviour |
| Smoke baseline, re-run by the Verifier (read-only) | 11/11 pass, 3 SKIP (one PR, no timeline, no thread on the PR read), app and temp folder cleaned up |
| Production defects | none |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | Spike findings S1–S8 in `design.md`; the owner's choices (S1 both ends, S6 fallback) folded into the spec |
| T2–T6 | ✅ Done | F4 made provider-neutral; F4 tests edited only where a `PrTarget`, `revision` or `no-remote` value changed shape (see § F4 unchanged) |
| T7–T19 | ✅ Done | Counts reconcile with 3058 → 3122 |
| T20 | ⚠️ Partial | Two boxes retired by the FPRG-07 amendment; two open with stated reasons: a rate limit cannot be exhausted on purpose, and F4's smoke was not re-run (no Azure DevOps sandbox). Both classified as follow-ups (F2, F5) |
| T21 | ✅ Done | Rewritten box: W3 marks each option `GitHub · #n` |
| T22 | ⚠️ Partial | One box open: an approval with no body cannot be produced with one account; the rule is unit-tested (follow-up F6) |
| T23 | ✅ Done | Ticked box "disabled with the reason" has no recorded run; evidence is code reading (follow-up F1) |
| T24 | ✅ Done | W21, W22 |
| T25 | ⚠️ Partial | One box open: a fork deleted under an open PR; the fallback is unit-tested (follow-up F6) |
| T26 | ✅ Done | `README.md:136-139` names both providers and exactly the four writes; AD-027 amended only to name T26 |
| T27 | ✅ Done | Read-only 11/11 + 3 SKIP (re-run here), `--allow-writes` 26/26 + 1 SKIP (author's run, not repeated: no GitHub writes allowed to this Verifier) |
| Fixes | ✅ Done | 3000-file note in `FileTree.tsx` (smoke R6 and SM3 below); zone anchoring in `DiffViewer.tsx` (W14); "one branch, one provider" resolved by the owner's spec amendment |

---

## Spec-Anchored Acceptance Criteria

Smoke check numbers are the **runtime** numbers the script prints: R*n* in the read-only run, W*n* in
the `--allow-writes` run, as `tasks.md` cites them. Read-only checks R1–R11 were re-run by this
Verifier against the F4 worktree's open fork → upstream pull request; W checks are the author's
recorded run, judged by reading `scripts/smoke-files-pr-github.mjs:1632-2054`. Line numbers are at
`e844998`.

### P1: Know whether GitHub is reachable

| AC | Spec-defined outcome | Evidence (`file:line` + assertion / smoke check) | Verdict |
| -- | -------------------- | ------------------------------------------------ | ------- |
| FPRG-01 | Token only from `gh auth token`, never stored | `src/main/github-gateway.test.ts:91-108` — `gh.calls` is exactly `[['auth','token']]` once, every request `Bearer gho_FAKE…`; `:208-267` — eight failure paths, `JSON.stringify(results)` never contains the token (masked `***`); `:64-68` — no console line contains it; token held only in `github-gateway.ts:64` (memory); `github:status` answers `GhStatus` (`src/shared/ipc-contract.ts`, code reading) | ✅ |
| FPRG-02 | Chip beside `az` while a registered repository has a GitHub remote | smoke R2 — `"gh · signed in", right after az`; the "while" half (no chip without a GitHub remote) is code reading: `src/main/index.ts:121-135,584-587` answers `no-github-remote` without starting `gh`, `src/renderer/src/components/TopBar.tsx:60-61` renders nothing then | ✅ (hidden state code-read: F3) |
| FPRG-03 | Not installed → `gh · not installed` + install page via the https-only opener | `src/main/github-gateway.test.ts:71-78` — `ENOENT` → `'not-installed'`, no request; smoke R10 — chip `gh · not installed`, Install offered; Install calls `pr:open-link` (`TopBar.tsx:46,64`), which `openPrLink` gates to https (`src/main/ado-pr.test.ts:672-680`) | ✅ |
| FPRG-04 | Not signed in → `gh · not signed in`; mode shows "run `gh auth login`" | `src/main/github-gateway.test.ts:80-89` — non-zero exit → `'not-signed-in'`; `src/main/github-pr.test.ts:188-198` — `findPrs` and `getPr` → `{ kind: 'auth' }`, no request; smoke R9 — chip `gh · not signed in`, mode "GitHub sign-in needed" / `gh auth login` | ✅ |
| FPRG-05 | Re-checked on focus, 5 s debounce | smoke R8 — a focus asks again, another 1 s later does not, one after 5 s does (`use-github-status.ts:30`); SM2 below | ✅ |

### P1: Find the branch's GitHub PR

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRG-06 | Every GitHub remote searched for open PRs with head `<source owner>:<branch>`; tracking no GitHub remote → no search, "not pushed to GitHub" | `src/main/github-pr.test.ts:111-152` — both remotes asked, each `head=contoso:feature/x`, `state=open`, fork's PR on the upstream returned; `:154-186` — tracking nothing or an ADO remote → `{ kind: 'none', createUrlAvailable: false }` and `readRequests` empty; `src/main/github-pr-model.test.ts:268-305`; `src/main/pr-locate.test.ts:40-108`; text `PrOverview.tsx:395-399` (code reading); smoke R3 — the fork → upstream PR found live | ✅ |
| FPRG-07 (amended) | One picker, each PR marked with its provider; a branch lists its tracked provider's PRs | `src/renderer/src/lib/pr-view.test.ts:197-211` — `prKey` of ADO `!7` and GitHub `#7` differ, `prLabel` reads `!7` / `#7`; `PrPicker.tsx:41-42` renders `GitHub · #n` with `data-provider` (code reading); one provider per branch: `github-pr.test.ts:166-171` (tracks ADO → no GitHub search); author's W3 — every option `GitHub · #n`; read-only picker check SKIP (one PR) | ✅ |
| FPRG-08 | No PR → Create PR opens the compare page of the target (the source's parent for a fork) from its default branch to `<source owner>:<branch>` | `src/main/github-pr.test.ts:241-292` — fork → parent `acme/widget`, `defaultBranch: 'main'`; non-fork → itself; opens exactly `https://github.com/acme/widget/compare/main...contoso:feature/x?expand=1`; unpushed refused; `src/main/remote-url.test.ts:178-207` — slash kept, segments encoded, every URL passes `isHttpsUrl` | ✅ unit (button not clicked by the smoke: F4) |

### P1: Read the GitHub PR

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRG-09 | Number, title, author, draft, base and head, created date, latest review state per reviewer, requested reviewers and teams without a review | `src/main/github-pr.test.ts:412-532` — the whole `PrDetail` by `toEqual`, reviewers `robin: approved` + team `widget-core: no-vote`; `src/main/github-pr-model.test.ts:153-192` — latest by date wins, pending excluded, re-requested reviewer listed once; smoke R3, R4 (meta 4/4), R5 (requested reviewer as No vote) | ✅ |
| FPRG-10 | Review bodies and PR comments in General, time order, author, review state, text, no Reply/Resolve | `src/main/github-pr-model.test.ts:200-234` — exact merged order with `reviewState`; `:238-256` — empty body adds no entry; `PrOverview.tsx:334-384` renders them with no buttons (code reading); author's W6; read-only SKIP (no timeline) | ✅ |
| FPRG-11 | Every changed file, across every page | `src/main/github-pr.test.ts:588-616` — pages 1,2,3 for 250 files, `per_page=100`; 3000 cap → 30 requests, `incomplete: true`; smoke R6 — 48 rows for 48 files | ✅ |
| FPRG-12 | Base side from the base repository at the merge base; head side from the head repository at the head commit | `src/main/github-pr.test.ts:620-637` — `compare/base1...head1` in the base repository; `:691-705` — reads `acme@merge1` then `contoso@head1`; smoke R7 — both sides 0 lines differ from git; SM4 below | ✅ |
| FPRG-13 | Each thread under its line on its side, resolved collapsed | `src/main/github-pr-model.test.ts:72-109` — `placed` with `side`, `startLine`/`endLine`, `resolution: 'resolved'`; `pr-view.test.ts:142-150` (zones per side); author's W9, W14; read-only SKIP (no thread) | ✅ |
| FPRG-14 | Outdated → listed in the Overview as outdated, never drawn | `src/main/github-pr-model.test.ts:57-69` — `{ kind: 'outdated', path, line: 30 }`; `pr-view.test.ts:63-75` (own group), `zonesForFile` draws `placed` only (`pr-view.ts:132-139`); author's W8 | ✅ |
| FPRG-15 | F4's inert renderer; links through the https-only path | `src/renderer/src/lib/markdown.test.ts:40-82` (F4: no `href`, `data-href` for https only); `src/main/ado-pr.test.ts:672-680` (`openPrLink` refuses `javascript:`); GitHub bodies go through `MarkdownBody` (code reading); author's W10 | ✅ |

### P2: Answer a GitHub review

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRG-16 | Reply, posting immediately | `src/main/github-pr.test.ts:815-826` — one `POST /repos/acme/widget/pulls/7/comments/501/replies` with `{ body }`; author's W16 — no pending review on GitHub | ✅ |
| FPRG-17 | Resolve when active, Reopen when resolved | `src/main/github-pr.test.ts:828-846` — `resolveReviewThread` / `unresolveReviewThread` with the node id; `PrThread.tsx:78-103` toggle (code reading); author's W9 (offers), W17, W18 (on GitHub) | ✅ |
| FPRG-18 | Disallowed reply / resolve / reopen → disabled with the reason | `src/main/github-pr-model.test.ts:111-131` — `viewerCanReply/Resolve/Unresolve` → `can: { reply: false, resolve: false, reopen: true }`; the gate itself, `deniedReasons` reading `can.resolve` on an active thread and `can.reopen` on a resolved one (`PrThread.tsx:135-146`, `:264`), is **code reading only** | ⚠️ thin — F1 |
| FPRG-19 | Both ends in hunks → thread anchored to those lines, posted at once | `src/shared/pr-diff-rules.test.ts:75-87` (same hunk, two hunks); `pr-view.test.ts:246-255` — `anchored(5, 30)`, bottom-up normalized; `github-pr.test.ts:848-887` — `commit_id`, `line: 30`, `side: 'RIGHT'`, `start_line: 5`, no `position`; author's W19, W20 | ✅ |
| FPRG-20 | Outside a hunk → composer says it will post as a general comment citing `path:Lstart–Lend`; preview shows the citation | `pr-view.test.ts:257-275` — exact banner `…citing src/app.ts:L5–L18.` and citation; `pr-diff-rules.test.ts:89-96`; `CommentComposer.tsx:84,106-110` (banner before typing, Preview of the same body; code reading); author's W21, W22 | ✅ |
| FPRG-21 | Posted as a general PR comment with the citation and the selected text fenced | `pr-diff-rules.test.ts:108-134` — exact fenced output, fence longer than any run; `pr-view.test.ts:287-301` — renders as one `<pre>`, no live link or tag; `github-pr.test.ts:889-897` — `POST …/issues/7/comments`; `PrDiffTab.tsx:122` routes a general plan to `pr.comment`; author's W23 | ✅ |
| FPRG-22 | No patch → every selection outside | `pr-diff-rules.test.ts:99-102`; `pr-view.test.ts:277-285` — `hunks: null` and no `hunks` key → `general`; `github-pr.test.ts:473` — an absent `patch` → `hunks: null` | ✅ |
| FPRG-23 | Overview general comment, posting immediately | `github-pr.test.ts:889-897`; author's W24 (the check at `scripts/smoke-files-pr-github.mjs:1983`) | ✅ |
| FPRG-24 | Writes only as the direct result of a user action | `github-pr.test.ts:91-100` — after **every** read test, no request other than GET or a GraphQL `query`, no `mutation`; `:899-920` — each write one request, only when called, another provider's PR refused unsent; renderer writes reached only from `onPost` / `onClick` (code reading); `README.md:136-139` | ✅ |

### P2: Stay current within GitHub's limits

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRG-25 | F4's reload rules; banner when the head commit changed | `pr-view.test.ts:176-185` — `revisionBanner(head, pushed)` true, same false, nothing on screen false; author's W25 (focus reload debounced), W26 (push → banner → Reload diffs at the new head) | ✅ |
| FPRG-26 | Rate limit → reset time shown, no retry until the next user-driven reload | `github-gateway.test.ts:143-194` — 403 with `remaining: 0`, 429 (reset or retry-after), GraphQL `RATE_LIMITED` each → `{ kind: 'rate-limited', resetAt }` exact; `github-pr.test.ts:212-225` — one request, no retry, `resetAt` carried; the hook's hold until a user-driven reload (`use-pull-request.ts:216-250`) and the reset-time text (`PrOverview.tsx:462`) are **code reading only** — T20's open box | ⚠️ thin — F2 |

### Spec-precision gaps

- **G1 — Edge case "a thread's anchored line no longer exists but GitHub has not marked it outdated".**
  The spec does not say how "no longer exists" is known. The code takes GitHub's `line: null` as the
  signal (`src/main/github-pr-model.ts:126`); a non-null line past the file's end would be drawn as
  given. Defensible (GitHub computes `line` against the head), but untested — U11 survived.
- **G2 — FPRG-26, "user-driven".** The hook counts entering the mode, a pick in the picker and Refresh
  as user-driven, and a focus or a post-write reload as not (`use-pull-request.ts:206-216,609-619`).
  The spec does not list them.
- **G3 — Edge case "more files than GitHub returns".** GitHub cannot say whether a 3000-file list is
  complete; the client flags exactly 3000 as incomplete (`github-pr.ts:351`). Conservative and
  unit-asserted, but the spec's "more than" is not what can be measured.
- **G4 — FPRG-07, "each marked with its provider".** With one pull request there is no picker
  (FPRA-04), so the mark is the Overview's `#n` / `!n` label only. Inherited from F4, not decided by
  this spec.

---

## Edge Cases

- [x] Fork deleted → head side from the base repository at the head commit; "head repository unavailable" only when that fails too — `src/main/github-pr.test.ts:707-748` (null head repository, a refusing fork, both failing → `The head repository is unavailable: …` with the base side still shown); never driven live (T25's open box, F6)
- [x] More files than the 3000 ceiling → the tree says the list is incomplete — `github-pr.test.ts:609-615`; `FileTree.tsx` note shown only on `filesIncomplete` (smoke R6, killed SM3)
- [x] Anchored line gone but not marked outdated → listed as outdated — handled for `line: null` (`github-pr-model.ts:126`); **no test** (U11 survived, F7); see G1
- [x] Empty review body → state only, no empty comment — `github-pr-model.test.ts:238-256`; never driven live (T22's open box, F6)
- [x] One provider per branch, each search kept apart — `github-pr.test.ts:166-171`; per-provider `searches` in the hook (`use-pull-request.ts:219-237`, code reading)
- [x] Equal numbers on both providers → tabs, picker entries and caches apart — `pr-view.test.ts:197-206` (`prKey` and `tabKeyOf` differ); `src/renderer/src/lib/diff-view.test.ts:516` pins the tab key `pr:azure-devops:acme/platform/widget/42:src/app.ts` (killed U24)
- [x] No GitHub remote → Azure DevOps exactly as F4 — `github-pr.test.ts:173-178` (ADO-only → `no-remote`, no request, `gh` never started); see § F4 unchanged; F4's smoke not re-run (F5)

---

## F4 unchanged (T2–T6)

- `src/main/ado-pr.test.ts`, `ado-pr-model.test.ts`: edits only where a value changed shape — `provider` moved into `target`, `iteration: 3` → `revision: '3'` + `ado: { iteration: 3 }`, `no-ado-remote` → `no-remote`. Every request URL and body assertion unedited.
- `AdoPrClient.locate` now delegates to `locateBranch` (`ado-pr.ts:494-508`); it reads `branch.<name>.remote` even when there is no Azure DevOps remote — one extra paced git read, no visible change. U22 (tracked remote dropped) is killed by four `ado-pr.test.ts` cases.
- `revisionBanner('4', '3')` is now true where F4 asserted false (`pr-view.test.ts:176-185`): an iteration only grows, so the case cannot arise (design N2). Recorded, not a regression.
- Two F4 texts now name their provider, as T5 intended: "No active pull request on Azure DevOps for this branch." and "This repository has no Azure DevOps remote…".

---

## Gate Check

- **Commands**: `npm run typecheck && npm run lint && npm test` on the real worktree; `npx electron-vite build` on the throwaway copy of the same HEAD
- **Tests**: 3122 passed, 0 failed, 0 skipped — 141 files, 169.6 s
- **Test count before feature**: 3058 (136 files), measured at the rebase
- **Test count after feature**: 3122 (141 files) — **+64**, matching T2–T17's recorded deltas; five new test files
- **Typecheck**: exit 0 · **Lint**: exit 0, 18 warnings (T2 baseline 18, unchanged) · **Build**: exit 0

---

## Discrimination Sensor

Unit mutants ran in a throwaway `git worktree` of `e844998` (`node_modules` by junction), each file
restored after its run; the junction was removed before the worktree. Smoke mutants ran the read-only
smoke (`SMOKE_ONLY` per section, never `--allow-writes`) from the same throwaway copy, so the dev app it
launched carried the mutant. The real worktree's `git status --porcelain` was empty before and after.

| # | Where | Mutation | Tests run | Killed? |
| - | ----- | -------- | --------- | ------- |
| U1 | `src/shared/pr-diff-rules.ts:40` | either end in a hunk is enough (`&&` → `\|\|`) | rules + pr-view | ✅ (2 failed) |
| U2 | `src/shared/pr-diff-rules.ts:24` | an omitted hunk count reads as 0 lines | rules + client | ✅ (2 failed) |
| U3 | `src/shared/pr-diff-rules.ts:54` | citation fence only as long as the longest run inside | rules + pr-view | ✅ (2 failed) |
| U4 | `src/renderer/src/lib/pr-view.ts:169` | Azure DevOps no longer always anchors | pr-view | ✅ (1 failed) |
| U5 | `src/renderer/src/lib/pr-view.ts:166-167` | a bottom-up selection is not normalized | pr-view | ✅ (2 failed) |
| U6 | `src/main/github-gateway.ts:162` | a 429 is not a rate limit | gateway + client | ✅ (1 failed) |
| U7 | `src/main/github-gateway.ts:85-87` | not installed and not signed in swapped | gateway + client | ✅ (4 failed) |
| U8 | `src/main/github-gateway.ts:158` | a 401 keeps the token | gateway + client | ✅ (1 failed) |
| U9 | `src/main/github-gateway.ts:114` | GraphQL `RATE_LIMITED` not recognized | gateway + client | ✅ (1 failed) |
| U10 | `src/main/github-pr-model.ts:182` | an empty review body adds a timeline entry | model + client | ✅ (2 failed) |
| U11 | `src/main/github-pr-model.ts:126` | a thread with `line: null` not marked outdated is placed | model + client | ❌ **Survived** — F7 |
| U12 | `src/main/github-pr-model.ts:154` | the earliest review wins instead of the latest | model + client | ✅ (1 failed) |
| U13 | `src/main/github-pr-model.ts:125` | `FILE` threads placed on GitHub's `line: 1` | model + client | ✅ (1 failed) |
| U14 | `src/main/github-pr.ts:392` | no fallback to the base repository when the fork refuses | client | ✅ (1 failed) |
| U15 | `src/main/github-pr.ts:351` | exactly 3000 files not flagged incomplete (`>=` → `>`) | client | ✅ (1 failed) |
| U16 | `src/main/github-pr.ts:536` | GraphQL connections never paged | client | ✅ (1 failed) |
| U17 | `src/main/github-pr.ts:199` | only the tracked remote searched (fork PR on the upstream missed) | client | ✅ (1 failed) |
| U18 | `src/main/github-pr.ts:506` | `start_line` sent for a one-line comment | client | ✅ (1 failed) |
| U19 | `src/main/github-pr.ts:427` | size cap doubled to 2 MB | client | ✅ (1 failed) |
| U20 | `src/main/github-pr.ts:196` | a branch tracking no GitHub remote is searched anyway | client | ✅ (1 failed) |
| U21 | `src/main/github-pr.ts:235` | Create PR targets the fork, never its parent | client | ✅ (1 failed) |
| U22 | `src/main/pr-locate.ts:43` | the tracked remote is always dropped | locate + both clients | ✅ (9 failed) |
| U23 | `src/renderer/src/lib/pr-view.ts:150` | revisions compared by order, not difference | pr-view | ✅ (1 failed) |
| U24 | `src/renderer/src/lib/pr-view.ts:30` | `prKey` without the provider | pr-view + diff-view | ✅ (1 failed, `diff-view.test.ts`; `pr-view.test.ts:197-206` alone does not catch it) |
| U25 | `src/main/github-pr.ts:199` | two remotes naming one repository searched twice (`uniqueTargets` dropped) | client | ❌ **Survived** — F8 |
| SM1 | `src/renderer/src/components/TopBar.tsx:50-51` | `not signed in` and `not installed` words swapped | smoke chip | ✅ R9 and R10 failed (chip "gh · not installed" when signed out, and the reverse) |
| SM2 | `src/renderer/src/lib/use-github-status.ts:30` | no 5 s focus debounce | smoke chip | ✅ R8 failed ("another 1 s later: asked") |
| SM3 | `src/renderer/src/components/FileTree.tsx:485` | "List incomplete" on every GitHub PR | smoke overview | ✅ R6 failed ("incomplete note SHOWN") |
| SM4 | `src/renderer/src/lib/use-pull-request.ts:366` | GitHub file sides read through the Azure DevOps channel | smoke diff | ✅ R7 failed (both sides 0 lines) |

**Sensor depth**: expanded (outward writes, a token in memory, third-party rendering): 25 unit + 4 smoke.
**Tally**: unit 23/25 killed, smoke 4/4 killed, each smoke mutant failing only its named check(s). Not
counted against the verdict: U11 and U25 are test gaps on correct production code. No smoke mutant
reached threads, writes or the rate limit: the read-only PR has no thread, and writes were out of scope
for this Verifier. The author's 14 falsification rounds at T27 were not repeated.

A first attempt at the smoke mutants through a Python `subprocess` wrapper aborted every run at
"the top bar never appeared"; those runs were discarded and SM1–SM4 re-run directly from the shell,
which is what the table reports.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — one gateway, one client, two pure modules, one renderer helper; no pending reviews, no polling |
| Surgical changes | ✅ — the F4 refactor is type-driven; F4 assertions on requests and bodies unedited |
| No scope creep | ✅ — exactly the four writes (`reply`, `setResolved`, `anchoredComment`, `generalComment`), matching AD-027 and the README |
| Matches patterns | ✅ — DI client like `AdoPrClient`, https opener reused, paced `git()` through `locateBranch` |
| Spec-anchored outcome check | ✅ — asserted values are the spec's and S1–S8's (URLs, bodies, banner text, citation, hunk ranges); 4 precision gaps flagged |
| Per-layer coverage expectation | ✅ — main and pure layers 1:1 by unit test; components and hooks by smoke + reading, per the Test Coverage Matrix |
| Every test maps to a requirement | ✅ — each new test names its FPRG, S-finding, edge case or lesson |
| Documented guidelines | ✅ — `.specs/codebase/TESTING.md`, Test Coverage Matrix in `tasks.md` |

One defect of form: in `src/main/index.ts:109-135`, `anyGitHubRemote` was inserted between
`readBranch`'s doc comment and `readBranch`, so the NOTF-30 comment now heads the wrong function and
`readBranch` has none (F9).

Privacy: fixtures and tests use `acme` / `widget` / `contoso` / `robin` and an obvious fake token; the
smoke reads coordinates from the environment and prints counts only.

---

## Follow-ups (not blocking)

- **F1 — FPRG-18 in the UI.** Nothing runs the disabled-with-reason gate. Extract `deniedReasons`
  (`PrThread.tsx:135`) into `pr-view.ts` with a unit test — active thread with `can.resolve: false`
  denies Resolve, resolved thread reads `can.reopen` — or drive a thread the viewer cannot resolve.
- **F2 — FPRG-26 in the hook.** The "no retry until a user-driven reload" rule lives only in
  `use-pull-request.ts:216-250`. A pure decision (`shouldAsk(provider, limited, userDriven)`) with a
  unit test would make it evidence instead of reading.
- **F3 — FPRG-02 hidden state.** No check proves the chip is absent with no GitHub remote; a smoke run
  over a workspace with only non-GitHub remotes would.
- **F4 — FPRG-08 button.** The smoke never clicks Create PR; the compare URL is unit-tested.
- **F5 — F4 regression smoke.** Re-run `scripts/smoke-files-pr-ado.mjs` read-only when an Azure DevOps
  sandbox PR exists again (T20's open box).
- **F6 — Live edge cases.** A deleted fork, an approval with no body and the rate limit itself are
  unit-tested only (T22, T25, T20 open boxes); each needs an account or a state the owner does not have.
- **F7 — U11 survived.** Add a `toThreadViews` case with `isOutdated: false, line: null` expecting
  `outdated` on `originalLine`; decide G1 first.
- **F8 — U25 survived.** Add a `findPrs` case with two remotes on one repository (`https` and `ssh`)
  expecting one request and one PR.
- **F9 — Misplaced doc comment** in `src/main/index.ts:109-121` (see Code Quality).
- **Spec gaps G1–G4** above.
- **Lessons not recorded.** This Verifier's brief allows committing `validation.md` only, so
  `lessons.py add` was not run. Candidates: "a model fallback for a provider's null field needs its own
  case, apart from the flag that usually comes with it" (U11); "a de-duplication step needs a fixture
  that has duplicates" (U25); "a renderer-only permission gate belongs in a pure helper so it can be
  tested" (F1).

---

## Requirement Traceability Update

Recommended for `spec.md` (not edited by the Verifier): FPRG-01..26 → **Verified**, with FPRG-18 and
FPRG-26 noted as resting on unit tests of their rule and code reading of the renderer (F1, F2).

---

## Isolation and hygiene

- Real worktree `git status --porcelain`: empty at the start, after the gate, and after the sensor and
  the removal of the throwaway worktree (checked before the commit of this report)
- `git worktree list` after cleanup: the three worktrees that existed before, no throwaway entry; the
  `node_modules` junction removed first, so the real `node_modules` was untouched
- No `--allow-writes`; nothing sent to GitHub but the app's own reads and the smoke's GETs
- No GitHub write of any kind by this Verifier

# Files Direction — GitHub Pull Requests (F5) Specification

## Epic Context

**F5 of 5** of the Files epic (slices and inherited decisions: `.specs/features/files-explore/spec.md` § Epic Context). F5 inherits from the epic grill:

- **Auth** = a minimal `GitHubGateway` taking its token from `gh auth token`, no stored secret, designed for issue #50 (GitHub issues as work items) to extend (epic Q11)
- **A `gh` chip beside the TopBar's `az` chip**, shown only when a registered repository has a GitHub remote, checked on window focus (epic Q11, Q13)
- **Which PR, the four writes, anchoring on the provider's head version** — exactly as F4 (epic Q6, Q9, Q10, Q12, Q14)

And from F4, whose plan was amended at this spec so both providers share one model (F5-Q4): the
Pull request mode, the Overview, threads in view zones, the composer, the inert markdown renderer,
the https-only link path and the freshness rules. **F5 is what GitHub does differently.**

---

## Problem Statement

F4 brings Azure DevOps pull requests into the Files direction. This repository — and every project
following its fork workflow — reviews on GitHub, where none of that exists: reading review comments,
answering them and resolving threads all happen in the browser. F5 makes the Pull request mode work
for GitHub, with the same surfaces and the same guarantees, adjusted to how GitHub models a review.

## Goals

- [ ] A GitHub PR — including the fork → upstream PR of this very workflow — is found with no configuration
- [ ] GitHub and Azure DevOps PRs of one branch appear side by side in one picker
- [ ] Every review comment reads next to its line, and the review's verdicts are visible
- [ ] Replying, resolving and commenting from a selection work within GitHub's rules, and the app says so when a rule changes what will happen
- [ ] The `gh` CLI's state is visible at a glance, with the right fix for each failure

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Approving, requesting changes, merging, closing or creating a PR in the app | Not among the four writes; Create PR opens GitHub's page (as F4) |
| Pending reviews ("Start a review") | Owner decision (F5-Q2): each comment posts immediately, as on Azure DevOps |
| Editing or deleting comments, reactions, suggestions (` ```suggestion `) applied from the app | Not requested |
| GitHub Enterprise Server | F3's `parseRemote` recognizes `github.com` only; other hosts are hidden, never guessed |
| GitHub issues as work items | Issue #50 — which reuses this slice's `GitHubGateway` |
| Checks, CI status, labels, milestones | Not requested |
| Polling | As F4 |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Auth | `gh auth token` through a minimal `GitHubGateway`; nothing stored | Epic Q11; mirrors `az` for ADO | y |
| `gh` chip states | `gh · not installed` (with a link to the CLI's install page) and `gh · not signed in` (with "run `gh auth login`"), distinct | Owner decision (F5-Q6): `gh` is optional where `az` is assumed, so the two failures need two fixes | y |
| Chip visibility | Only while a registered repository has a GitHub remote; re-checked on focus with the 5 s debounce | Epic Q13 | y |
| Which PRs | For each GitHub remote as target: open PRs whose head is `<source owner>:<branch>`, the source owner being the owner of the remote the branch pushes to | Epic Q14; finds this repository's own fork-flow PRs (`<fork owner>:feature/x` → the upstream's `main`) | y |
| Both providers | One search across Azure DevOps and GitHub, one picker, each PR marked with its provider | Owner decision (F5-Q5): no priority rule may hide a real PR | y |
| PR diff sides | Base side = the file at the merge base of the PR's base and head, read from the **base** repository; head side = the file at the PR's head commit, read from the **head** repository — the fork, for a fork PR | For a fork PR the head commit may exist only in the fork | y |
| Files | The PR's file list, every page | GitHub pages it (at most 100 per page) | y |
| Threads | GitHub's review threads: path, line, start line, side, `isResolved`, `isOutdated`, and the viewer's permissions to reply, resolve and unresolve | Verified in GitHub's GraphQL schema by introspection. **The REST API has no way to resolve or unresolve a thread** (checked in GitHub's REST reference) | y |
| Outdated | `isOutdated` threads are listed in the Overview as outdated and not drawn, matching FPRA-19 | GitHub reports it directly; nothing to infer | y |
| Resolve control | A **Resolve / Reopen** toggle instead of F4's status selector | GitHub threads have no statuses, only resolved or not | y |
| Permissions | An action the viewer may not perform is shown disabled with the reason | GitHub reports `viewerCanReply`, `viewerCanResolve`, `viewerCanUnresolve` per thread | y |
| Reviews in the Overview | Each reviewer's latest review state (approved, changes requested, commented, dismissed) plus requested reviewers and teams who have not reviewed; review bodies appear among general comments in time order | Owner decision (F5-Q3); the GitHub equivalent of F4's votes | y |
| Comment timing | Every comment — reply, anchored or general — posts immediately, never into a pending review | Owner decision (F5-Q2) | y |
| Selection outside the diff | GitHub only anchors comments to lines of the PR's diff hunks; a selection not fully inside one becomes a **general comment** citing `path:Lstart–Lend` with the selected text in a fenced block | Owner decision (F5-Q1). That GitHub rejects anchors outside the hunks is known behaviour **not stated on the REST reference page — the Design spike verifies it** | n — verify at Design |
| Telling the user | The composer shows, before posting, that the comment will be general and why; the preview shows the citation as it will appear | Owner decision (F5-Q7) | y |
| A file with no patch | GitHub omits the patch for large or binary files; every selection in such a file counts as outside the diff | Without the hunks, an anchor cannot be known to be valid | y |
| Create PR | GitHub's compare page on the target repository — the source's parent when the source is a fork, the source itself otherwise — from the target's default branch to `<source owner>:<branch>` | The fork flow's PR lands on the upstream, never on the fork | y |
| Markdown | F4's renderer (`markdown-it`, HTML disabled); GitHub bodies are always markdown | One inert renderer for all third-party content | y |
| Rate limit | When GitHub reports the limit exhausted, the mode says so with the reset time and does not retry | No polling exists to make it worse; a loop would | y |
| Probes during Design | Only on a **scratch repository the owner names** — never on this repository's upstream, whose PRs notify real maintainers | Outward writes; privacy guardrail | y |
| Project decision | **AD-027** (recorded 2026-09-19) already covers both providers: the app writes PR comments to Azure DevOps **and GitHub**, only on explicit user action, and probes never target this repository's upstream | One posture for both providers | y |
| Branch base | `feature/files-pr-github` stacked on `feature/files-pr-ado` | Reuses every F4 surface | y |

**Open questions:** one, logged above and owned by Design — confirming that GitHub rejects anchors outside the diff hunks, which decides the general-comment path's trigger.

---

## User Stories

### P1: Know whether GitHub is reachable ⭐ MVP

**User Story**: As the developer, I want a `gh` chip that tells me whether the GitHub CLI is missing
or signed out, so that I know which fix to apply before I open a PR.

**Why P1**: Nothing GitHub works without it, and the two failures need different fixes.

**Acceptance Criteria**:

1. The system SHALL obtain a GitHub token only from `gh auth token` and SHALL NOT store it <!-- ubiquitous -->
2. WHILE a registered repository has a GitHub remote the TopBar SHALL show a `gh` chip beside the `az` chip <!-- state-driven -->
3. IF the `gh` CLI is not installed THEN the chip SHALL read `gh · not installed` and offer the CLI's install page through the https-only opener <!-- unwanted-behavior -->
4. IF `gh` is installed but not signed in THEN the chip SHALL read `gh · not signed in`, and the Pull request mode SHALL show "run `gh auth login`" for GitHub PRs <!-- unwanted-behavior -->
5. WHEN the window gains focus THEN the `gh` state SHALL be re-checked, debounced by 5 s <!-- event-driven -->

**Independent Test**: With `gh` logged out, the chip reads `gh · not signed in`; after `gh auth login` and a focus, it reads signed in.

---

### P1: Find the branch's GitHub PR ⭐ MVP

**User Story**: As the developer, I want the Pull request mode to find my branch's open GitHub PR,
including one from my fork to the upstream, so that the fork workflow needs no configuration.

**Why P1**: It is the case this repository lives in.

**Acceptance Criteria**:

6. WHILE in Pull request mode the system SHALL search every GitHub remote for open PRs whose head is the branch in the repository it is pushed to, including a fork's branch opened against an upstream <!-- state-driven -->
7. The system SHALL list PRs found on GitHub and on Azure DevOps in one picker, each marked with its provider <!-- ubiquitous -->
8. IF no PR is found on any provider THEN **Create PR** SHALL offer, for GitHub, the compare page of the target repository — the source's parent for a fork — from its default branch to `<source owner>:<branch>` <!-- unwanted-behavior -->

**Independent Test**: This repository's `feature/status-bar`, pushed to the fork with a PR open on the upstream, is found; a branch with no PR offers the upstream's compare page.

---

### P1: Read the GitHub PR ⭐ MVP

**User Story**: As the developer, I want the same Overview and PR diffs F4 gives Azure DevOps, with
GitHub's reviews and outdated comments shown faithfully.

**Why P1**: Reading the review is the slice.

**Acceptance Criteria**:

9. The Overview of a GitHub PR SHALL show its number, title, author, draft state, base and head, creation date, each reviewer's latest review state, and requested reviewers and teams who have not reviewed <!-- ubiquitous -->
10. The Overview SHALL list review bodies and PR comments as general comments in time order <!-- ubiquitous -->
11. The PR's file tree SHALL list every changed file, across every page GitHub returns <!-- ubiquitous -->
12. A GitHub PR diff SHALL read its base side from the base repository at the merge base and its head side from the head repository at the PR's head commit <!-- ubiquitous -->
13. The PR diff SHALL draw each review thread under its line on its side, resolved threads collapsed <!-- ubiquitous -->
14. IF GitHub reports a thread as outdated THEN it SHALL be listed in the Overview as outdated and SHALL NOT be drawn in the diff <!-- unwanted-behavior -->
15. GitHub content SHALL be rendered by F4's inert markdown renderer, and its links SHALL open only through the https-only path <!-- ubiquitous -->

**Independent Test**: On a fork PR with one resolved thread, one outdated thread and an approval, the Overview shows the approval and lists the outdated thread; the diff shows the resolved one collapsed and not the outdated one.

---

### P2: Answer a GitHub review

**User Story**: As the developer, I want to reply, resolve and comment on GitHub within its rules, and
be told before posting when a rule turns my anchored comment into a general one.

**Why P2**: As in F4, reading works without it.

**Acceptance Criteria**:

16. Each GitHub thread SHALL offer Reply, posting immediately <!-- ubiquitous -->
17. Each GitHub thread SHALL offer **Resolve** when active and **Reopen** when resolved, in place of F4's status selector <!-- ubiquitous -->
18. IF GitHub reports the viewer may not reply, resolve or reopen a thread THEN that action SHALL be disabled with the reason <!-- unwanted-behavior -->
19. WHEN the user comments on a modified-side selection lying entirely within the file's diff hunks THEN the system SHALL post a thread anchored to those lines immediately, not into a pending review <!-- event-driven -->
20. WHEN the user comments on a selection not lying entirely within the diff hunks THEN the composer SHALL state, before posting, that the comment will be posted as a general comment citing `path:Lstart–Lend`, and its preview SHALL show that citation <!-- event-driven -->
21. WHEN such a comment is posted THEN it SHALL be a general PR comment containing the citation and the selected text in a fenced code block <!-- event-driven -->
22. IF GitHub provided no patch for the file THEN every selection in that file SHALL be treated as outside the diff hunks <!-- unwanted-behavior -->
23. The Overview SHALL offer a general comment, posting immediately <!-- ubiquitous -->
24. The system SHALL write to GitHub only as the direct result of a user action <!-- ubiquitous -->

**Independent Test**: Comment on two changed lines — the thread lands on them on github.com. Expand an unchanged region, comment there — the composer warns, and the comment lands as a general one quoting the lines.

---

### P2: Stay current within GitHub's limits

**User Story**: As the developer, I want a GitHub PR to refresh like an Azure DevOps one, and to be told
plainly when GitHub is rate-limiting me.

**Why P2**: Correct at open time without it.

**Acceptance Criteria**:

25. A GitHub PR SHALL reload under F4's rules (FPRA-33), and SHALL show F4's banner when the PR's head commit changed <!-- ubiquitous -->
26. IF GitHub reports the rate limit exhausted THEN the mode SHALL show the reset time and SHALL NOT retry until the next user-driven reload <!-- unwanted-behavior -->

---

## Edge Cases

- WHEN the fork a PR came from has been deleted THEN the head side SHALL show that the head repository is unavailable instead of failing the whole PR
- IF a PR changes more files than GitHub returns (its 3000-file ceiling) THEN the tree SHALL say the list is incomplete
- WHEN a thread's anchored line no longer exists but GitHub has not marked it outdated THEN it SHALL be listed in the Overview as outdated rather than drawn on a wrong line
- IF a review body is empty (an approval with no text) THEN only the state SHALL be shown, with no empty comment
- WHEN the same branch has a GitHub PR and an Azure DevOps PR THEN choosing one in the picker SHALL not affect the other's cached state

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FPRG-01 | P1: Know whether GitHub is reachable | Design | Pending |
| FPRG-02 | P1: Know whether GitHub is reachable | Design | Pending |
| FPRG-03 | P1: Know whether GitHub is reachable | Design | Pending |
| FPRG-04 | P1: Know whether GitHub is reachable | Design | Pending |
| FPRG-05 | P1: Know whether GitHub is reachable | Design | Pending |
| FPRG-06 | P1: Find the branch's GitHub PR | Design | Pending |
| FPRG-07 | P1: Find the branch's GitHub PR | Design | Pending |
| FPRG-08 | P1: Find the branch's GitHub PR | Design | Pending |
| FPRG-09 | P1: Read the GitHub PR | Design | Pending |
| FPRG-10 | P1: Read the GitHub PR | Design | Pending |
| FPRG-11 | P1: Read the GitHub PR | Design | Pending |
| FPRG-12 | P1: Read the GitHub PR | Design | Pending |
| FPRG-13 | P1: Read the GitHub PR | Design | Pending |
| FPRG-14 | P1: Read the GitHub PR | Design | Pending |
| FPRG-15 | P1: Read the GitHub PR | Design | Pending |
| FPRG-16 | P2: Answer a GitHub review | Design | Pending |
| FPRG-17 | P2: Answer a GitHub review | Design | Pending |
| FPRG-18 | P2: Answer a GitHub review | Design | Pending |
| FPRG-19 | P2: Answer a GitHub review | Design | Pending |
| FPRG-20 | P2: Answer a GitHub review | Design | Pending |
| FPRG-21 | P2: Answer a GitHub review | Design | Pending |
| FPRG-22 | P2: Answer a GitHub review | Design | Pending |
| FPRG-23 | P2: Answer a GitHub review | Design | Pending |
| FPRG-24 | P2: Answer a GitHub review | Design | Pending |
| FPRG-25 | P2: Stay current within GitHub's limits | Design | Pending |
| FPRG-26 | P2: Stay current within GitHub's limits | Design | Pending |

**Coverage:** 26 total, 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] This repository's own fork → upstream PRs are found and read with no configuration
- [ ] A branch with PRs on both providers lists both in one picker
- [ ] Resolve / Reopen works where GitHub allows it and is disabled, with a reason, where it does not
- [ ] An out-of-diff selection is never posted as an anchored comment, and the user is told before posting
- [ ] `gh` missing and `gh` signed out read differently in the chip
- [ ] No probe or smoke ever writes to this repository's upstream
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`

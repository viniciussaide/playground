# Workspace Node Collapse Specification

## Problem Statement

Every workspace row in the sidebar renders a chevron (`Sidebar.tsx:172`), but it is a
bare decorative `<Icon name="chevron-down">` — no button, no handler, no state. Clicking
it does nothing. The affordance promises a collapse that was never built:
`sidebar-resize-collapse` covered collapsing the **pane** (PANE-01..09), not the nodes
inside it. A user with several registered workspaces cannot fold the ones they are not
working in, so the tree stays long and the workspace they care about scrolls away.

## Goals

- [ ] A workspace row folds and unfolds its repos from the chevron that already exists
- [ ] The folded/unfolded state survives an app restart
- [ ] The chevron is a real control, reachable by keyboard and announced correctly

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Collapsing an individual repo (hiding its worktrees) | Owner decision: workspace level only. The repo row has no chevron today, so nothing is promised and nothing is broken. Cheap follow-up once this mechanism exists |
| Collapse-all / expand-all control | No demand; one more control on a row that already carries a remove button |
| Per-workspace width or ordering | Different concern; widths are global (`sidebar-resize-collapse`) |
| Collapse state in the Board / Agents / Workflows directions | The tree sidebar is the only surface that renders workspace nodes |
| Animating the fold | The pane collapse ships without animation; matching it keeps the surface consistent |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where the state persists | New optional `ui.collapsedWorkspaces: string[]`; absent = every workspace expanded | Matches the existing persisted-UI pattern (`sidebarCollapsed`, `tasksCollapsed`) and leaves both `WorkspaceEntry` and the `tree:get` contract untouched — UI state does not belong in the workspace registry | y |
| Identity key | `WorkspaceEntry.id` | Already the stable identity: the normalized lowercased absolute path (`tree.ts:2-9`). Survives a `displayName` rename | y |
| Default state for an unknown id | Expanded | Forward-compatible with configs written by older builds, and the safe default: content visible | y |
| What collapsing hides | The workspace's repos and its "no git repos" note | Those are the children; the row itself stays as the handle to unfold | y |
| A missing folder stays visible when collapsed | The "folder not found" note renders even while collapsed | Hiding an error behind a fold means a broken workspace looks identical to a healthy folded one. The note is one line and it is the thing the user must act on | y |
| Persist failure does not block the fold | In-memory state wins; a `config:patch` rejection is logged, matching `App.tsx`'s existing `update()` | Same posture as theme, direction and pane widths | y |
| Remaining implicit dimensions (auth, external calls, concurrency, idempotency, observability) | N/A for this scope | Pure renderer-side UI state written through the existing `config:patch` channel | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Fold a workspace from its chevron ⭐ MVP

**User Story**: As a user with several registered workspaces, I want to fold the ones I
am not working in so that the sidebar shows the workspace I care about without scrolling.

**Why P1**: It is the reported gap and the whole feature; the chevron already implies it.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN the user activates a workspace row's chevron THEN the app SHALL toggle that workspace between expanded and collapsed.  <!-- event-driven -->
2. WHILE a workspace is collapsed the app SHALL NOT render its repos.  <!-- state-driven -->
3. WHILE a workspace is collapsed its chevron SHALL point right, and while expanded it SHALL point down.  <!-- state-driven -->
4. The workspace chevron SHALL be a `<button>` carrying an `aria-expanded` attribute that reflects the current state.  <!-- ubiquitous -->
5. WHEN the collapsed state changes THEN the app SHALL persist the collapsed workspace ids via `config:patch`.  <!-- event-driven -->
6. WHERE a workspace id is absent from `ui.collapsedWorkspaces` the app SHALL render that workspace expanded.  <!-- optional-feature -->
7. WHEN the app restarts THEN each workspace SHALL render in the state it was left in.  <!-- event-driven -->

**Independent Test**: Register two workspaces, fold the first — its repos disappear and
the chevron turns right. Quit and relaunch: the first is still folded, the second still
expanded. Unfold the first and its repos come back.

---

## Edge Cases

- IF a workspace is collapsed AND its folder is missing THEN the app SHALL still render the "folder not found" note.  <!-- unwanted-behavior -->
- WHEN a workspace is removed from the registry THEN the app SHALL drop its id from `ui.collapsedWorkspaces`.  <!-- event-driven -->
- IF `ui.collapsedWorkspaces` holds an id matching no registered workspace THEN the app SHALL ignore it.  <!-- unwanted-behavior -->
- WHEN the user activates the chevron THEN the app SHALL NOT also trigger the row's remove button or its context menu.  <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WSCL-01 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-02 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-03 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-04 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-05 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-06 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-07 | P1: Fold a workspace from its chevron | - | ✅ Verified |
| WSCL-08 | Edge cases | - | ✅ Verified |
| WSCL-09 | Edge cases | - | ✅ Verified |
| WSCL-10 | Edge cases | - | ✅ Verified |
| WSCL-11 | Edge cases | - | ✅ Verified |

**ID format:** `WSCL-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 11 total, 0 mapped to tasks (Tasks phase skipped for this scope), 0 unmapped

---

## Success Criteria

- [ ] Folding a workspace removes its repo rows from the sidebar
- [ ] The fold state of every workspace survives a restart
- [ ] The chevron is reachable by keyboard and announces expanded/collapsed

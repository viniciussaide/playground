# Work Item Type Badge Colors Specification

## Problem Statement

The app shows a type badge on pinned work items across six surfaces (sidebar,
tasks pane, board, worktree detail, agents view, session rail). Today
`typeClass()` maps only Bug → red, Feature → accent and Chore → amber; every
other type (Task, Epic, User Story, Fault, ...) falls through to the same
neutral `muted` color, so all badges look alike. The user wants each badge to
use the same color Azure DevOps uses for that work item type.

## Goals

- [ ] Every standard ADO work item type badge renders with the ADO color for that type, across all six surfaces
- [ ] Types outside the standard set keep a neutral fallback (no invented colors)
- [ ] State badges (Active, New, In Progress, ...) keep their current colors — untouched

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| State badge colors (`stateClass`) | The request is about type badges only |
| Dynamic colors fetched from the ADO process API (`wit/workitemtypes`) | Custom types (e.g. Fault) would get their process-defined color, but it adds a network call + caching; the ask is a static ADO palette. Future candidate |
| Changing the type badge text/icon | Visual color only |
| Colors for custom/unknown types (Fault, Requirement, Test Case, ...) | ADO defines no default color for them; they keep the neutral fallback |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| ADO palette source | Azure DevOps default process colors (Microsoft Learn `process-configuration-xml-element` + current ADO Services palette) | The user's org runs a customized process, but the standard palette is the only authoritative static source | y |
| Color map | Bug #CC293D, Task #F2CB1D, User Story #009F5B, Feature #0078D7, Epic #773B93, Issue/Impediment #FF9D00, Product Backlog Item #009CCC | The colors ADO uses for these types in its default processes | y |
| Fault (custom MultiClubes type) | #B4009E (magenta) | ADO defines no default for it; user asked for a color. #B4009E is an ADO-used tone (Issue/Code Review in the MSF Agile process) and stays distinct from Bug red | y |
| Unknown types (Requirement, Test Case, Test Plan, Shared Steps, Code Review, Feedback, empty) | Neutral `muted` badge, as today | No ADO default color exists for them; avoids inventing colors | y |
| Match is case-insensitive and trim-safe | `"user story"` == `"User Story"` == `"USER STORY"` | ADO returns display names with casing; current switch already lowercases | y |
| Light/dark theme behavior | Keep the existing pill pattern: text in the ADO color, background `color-mix(… 16%, transparent)`; the ADO colors keep adequate contrast on both themes | Consistent with every other pill in the app; no new theme tokens | y |
| Remaining implicit dimensions (concurrency, auth, persistence, data lifecycle, external calls) | N/A | Pure renderer-side mapping of an existing string field; no async or shared state | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Type badges use the Azure DevOps colors ⭐ MVP

**User Story**: As a user pinning ADO work items, I want the type badge on each
item to use the same color Azure DevOps uses for that type, so I can tell a
Bug from a Task from an Epic at a glance.

**Why P1**: This is the entire request; it is a static mapping with no new surface.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a work item of type Bug, Task, User Story, Feature, Epic, Issue, Impediment, Product Backlog Item or Fault is displayed THEN the type badge SHALL render with the ADO color for that type (Bug #CC293D, Task #F2CB1D, User Story #009F5B, Feature #0078D7, Epic #773B93, Issue/Impediment #FF9D00, Product Backlog Item #009CCC, Fault #B4009E). <!-- event-driven -->
2. WHEN the work item type is not one of the mapped types THEN the type badge SHALL render with the neutral `muted` colors. <!-- unwanted-behavior -->
3. The type match SHALL be case-insensitive (`"user story"` matches `"User Story"`). <!-- ubiquitous -->
4. WHILE the app is in light or dark theme the type badge SHALL keep the mapped color with the standard tinted background. <!-- state-driven -->

**Independent Test**: Pin a Bug, a Task, a User Story, an Epic, a Fault and a custom type (e.g. Requirement); the badges show six distinct colors, matching ADO's palette plus the Fault magenta, and the unassigned one stays neutral.

---

## Edge Cases

- IF the type string is empty or whitespace THEN the badge SHALL render neutral (`muted`). <!-- unwanted-behavior -->
- IF the type is a custom type without an assigned color (e.g. `Requirement`, `Test Case`) THEN the badge SHALL render neutral (`muted`). <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TYPE-01        | P1    | Design | Implementing |
| TYPE-02        | P1    | Design | Implementing |
| TYPE-03        | P1    | Design | Implementing |
| TYPE-04        | P1    | Design | Implementing |
| TYPE-05        | Edge  | -      | Implementing |
| TYPE-06        | Edge  | -      | Implementing |

**ID format:** `TYPE-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] A Bug, Task, User Story, Feature, Epic, Issue, PBI and Fault badge are visually distinct on the board and sidebar
- [ ] No badge regresses to a single flat color across the six surfaces
- [ ] Gate (`typecheck && lint && test`) stays green
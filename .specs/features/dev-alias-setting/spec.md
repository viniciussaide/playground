# Dev Alias Setting Specification

## Problem Statement

`ado.devAlias` feeds the `{dev}` placeholder of the start-work branch template, but
`branch-template-nested` shipped it as hand-edited config (that spec's decision row:
"`{dev}` comes from a new global `ado.devAlias` (hand-edited config)"). No settings
surface was ever built. Hand-editing does not survive: `ConfigStore` loads
`config.json` once at startup and is authoritative in memory, and **every**
`config:patch` rewrites the whole file from that snapshot (`config-store.ts:26-30,63-77`).
Patches fire constantly — pane resize, direction switch, session persistence — so an
edit made while the app is running is discarded on the next one. The observed result:
`ado.devAlias` sits at `''` with `branchTemplate` set to
`user/{dev}/{usId}-{usSlug}/{id}-{slug}`, so `{dev}` renders empty, the sanitizer drops
the empty segment, and every start-work branch is cut without its developer segment.

## Goals

- [x] The developer alias is editable in the settings dialog and survives a restart
- [x] A saved alias reaches the next start-work branch prefill with no restart
- [x] Hand-editing `config.json` stops being the only way to set the alias

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| `ConfigStore` reconciling external edits to `config.json` | Separate concern; once the alias has a settings field, hand-editing is no longer the path. The clobbering behaviour is unchanged by this feature |
| Per-workspace `devAlias` override | Already excluded by `branch-template-nested`: the alias is the same across repos |
| Deriving the alias from the ADO identity | Already decided in `branch-template-nested`: the branch alias is not derivable from the ADO account (the email differs) |
| Validating the alias against git ref rules | See assumptions: the branch stays editable in the dialog and git rejects a truly invalid ref at creation |
| ~~`SettingsDialog.commitForm` dropping `undoByte` when an agent is edited (`SettingsDialog.tsx:90-97`)~~ **RESOLVED 2026-09-10 (owner): follow-up after PR #83 merges** | A real pre-existing defect in the same dialog, found while specifying this feature. First decided to ride this branch, then **reverted**: `AgentDef.undoByte` exists only in PR #83 (`terminal-copy-undo-fixes`, open upstream) — the fix cannot compile against this branch's `main` base. Once #83 merges it is a one-line preservation fix in `commitForm` |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where the field lives | In the ADO/templates block of `SettingsDialog`, saved by the existing explicit **Save** | Those four fields already share one Save; the agent registry and default shell are the immediate-persist ones (`SettingsDialog.tsx:78-86`). The alias belongs with the template it feeds | y |
| Persistence shape | Existing `ado.devAlias` string; no schema change | The field already exists in `AppConfig` and `DEFAULT_CONFIG` (`config.ts:61,91`) | y |
| Blank alias behaviour | `{dev}` renders empty and the segment is dropped | Already specified by `branch-template-nested` CONFIG-02; this feature must not change it | y |
| Character validation | Trim only; no rejection of spaces, slashes or other characters | The alias is a free-form path segment. Over-validating would reject legitimate aliases; a bad one is visible in the prefilled branch, which stays editable before creation, and git refuses a genuinely invalid ref. Accepted trade-off: a slash in the alias silently nests one level deeper | y |
| Live application after Save | The already-wired `onSaved` path re-threads the alias | `App.tsx:373` already calls `setDevAlias(config.ado.devAlias)` on save — no new plumbing | y |
| Remaining implicit dimensions (concurrency, auth, external calls, data lifecycle, observability, idempotency) | N/A for this scope | One text field on an existing dialog writing one existing config key through an existing IPC channel | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Dev alias editable in settings ⭐ MVP

**User Story**: As a developer, I want to set my branch alias in the settings dialog so
that start-work branches carry my `{dev}` segment without me hand-editing `config.json`.

**Why P1**: It is the whole feature; without it the alias has no durable source.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN the settings dialog opens THEN it SHALL populate the Dev alias field from `ado.devAlias`.  <!-- event-driven -->
2. WHEN the user saves THEN the app SHALL persist the trimmed field value to `ado.devAlias` in the same `config:patch` that carries org, project and the two templates.  <!-- event-driven -->
3. WHEN the save resolves THEN the app SHALL use the saved alias for the next start-work prefill without a restart.  <!-- event-driven -->
4. The Dev alias field SHALL carry a label stating that it fills the `{dev}` placeholder of the branch template.  <!-- ubiquitous -->
5. WHILE the Dev alias field is empty the `{dev}` placeholder SHALL render empty and its branch segment SHALL be dropped.  <!-- state-driven -->
6. WHILE neither the branch template nor the worktree template contains `{dev}` THEN the Dev alias field SHALL be hidden.  <!-- state-driven -->

**Independent Test**: Set the alias to `jdoe`, save, close the dialog, start work on a
pinned task — the prefilled branch reads `user/jdoe/<us-id>-<us-slug>/<task-id>-<task-slug>`.
Restart the app and reopen settings: the field still reads `jdoe`.

---

## Edge Cases

- IF `ado.devAlias` is absent from a `config.json` written by an older build THEN the field SHALL render as empty rather than `undefined`.  <!-- unwanted-behavior -->
- IF the user enters only whitespace THEN the app SHALL persist an empty string.  <!-- unwanted-behavior -->
- IF the `config:patch` call rejects THEN the app SHALL log the failure and leave the dialog open, matching the existing save-failure path.  <!-- unwanted-behavior -->
- IF both templates are blank THEN the field SHALL be hidden (the defaults `{type}/{id}-{slug}` / `{repo}-{branch}` carry no `{dev}`).  <!-- unwanted-behavior -->
- IF only the worktree template contains `{dev}` THEN the field SHALL be visible.  <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| DEVA-01 | P1: Dev alias editable in settings | - | Verified |
| DEVA-02 | P1: Dev alias editable in settings | - | Verified |
| DEVA-03 | P1: Dev alias editable in settings | - | Verified |
| DEVA-04 | P1: Dev alias editable in settings | - | Verified |
| DEVA-05 | P1: Dev alias editable in settings | - | Verified |
| DEVA-06 | Edge cases | - | Verified |
| DEVA-07 | Edge cases | - | Verified |
| DEVA-08 | Edge cases | - | Verified |
| DEVA-09 | P1: Dev alias editable in settings | - | Verified |
| DEVA-10 | Edge cases | - | Verified |

**ID format:** `DEVA-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 10 total, 0 mapped to tasks (Tasks phase skipped for this scope), 0 unmapped

---

## Success Criteria

- [x] The alias set in the dialog survives an app restart
- [x] A start-work branch prefill contains the alias segment with no hand-edit of `config.json`
- [x] Saving the dialog leaves org, project and both templates unchanged

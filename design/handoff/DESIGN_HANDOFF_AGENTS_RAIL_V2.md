# Handoff: Agents rail — group sessions by task (rail v2)

> Scoped change handoff. Replaces **only** section C-a (session rail) of `DESIGN_HANDOFF_AGENTS.md`. The terminal detail pane, dialogs, entry points, tokens and behavior elsewhere are unchanged. Reference implementation: `Worktree Manager.dc.html` → **Agents** direction (design reference, not production code). Options that were explored before this decision: `Agents Rail Explorations.dc.html` (1b chosen).

## 1. Why

Today each session card repeats the same four lines: agent title, worktree name (`Code-24173`), full branch path, then the task tag. With several agents on one worktree the task information is duplicated, and the **task title — the most useful label — lands on the fourth line** in the smallest type.

Rail v2 states the task **once**, as a group header, and reduces each session to one compact row. Worktree name and branch path leave the rail entirely (they are already shown at full width in the terminal header and attribution strip).

## 2. Data — grouping is derived, nothing new is stored

No schema change. `Session` still persists as `{ id, agent, cwd, title, status }`. Grouping is computed in the renderer at render time:

```ts
type RailGroup =
  | { kind: 'task'; taskId: string; task: Task; branch: string; sessions: Session[] }
  | { kind: 'orphan'; reason: 'detached' | 'untagged' | 'missing'; label: string; sessions: Session[] };
```

Build order (stable, must not reshuffle on status change):

1. Iterate `sessions` in their existing persisted order.
2. For each session resolve the worktree by `cwd === worktree.path`, then the task by `taskIdFromBranch(worktree.branch)` — the same derivation the current card uses.
3. Group key: `task:<taskId>` when a task resolves, otherwise `session:<session.id>` (orphans are never merged with each other).
4. A group's header data comes from its **first** session's resolved worktree. Sessions on different worktrees that resolve to the same task ID land in the same group — accepted and intended; the branch lives in each row's tooltip.
5. Group order = first appearance of its key. New sessions append; a group vanishes when its last session is removed.

Per-session row data (all already available): `agentName` (display name from the `AgentDef`, not the editable session title), `status` short label, agent color, `agentLive`, `pathMissing`.

Short status labels — note these are **shorter than the detail pane's**: `running` · `shell` (agent exited, shell live) · `stopped` · `path missing`. The full "agent exited · shell" wording stays in the terminal header pill.

## 3. Structure

```
rail (344px, unchanged header + concurrency warning)
└─ scroll body   padding 11px 12px 16px · column · gap 9px   ← gap unchanged
   └─ TaskGroupCard  (one per group)
      ├─ header      column · gap 6px
      └─ rows        column · gap 2px · border-top · padding-top 7px
         └─ SessionRow  (one per session)
```

Header and the ≥4-running concurrency warning are unchanged from v1.

## 4. Specs

### 4.1 TaskGroupCard

| Property | Value |
|---|---|
| box | `box-sizing: border-box`, width 100% |
| border | `1px solid var(--border)` |
| border (group contains active session) | `1px solid color-mix(in oklab, var(--accent) 45%, var(--border))` |
| background | `var(--panel)` |
| radius | 13px |
| padding | `11px 12px 9px` |
| layout | column flex, gap 9px |

The group card is **not** clickable and has no hover state — only its rows are interactive.

### 4.2 Group header — task attached

Row 1 (row flex, gap 7px, `min-width: 0`):
- **type pill** — 10px / 700, padding `1px 7px`, radius 20px, `background: color-mix(in oklab, <typeColor> 14%, transparent)`, `color: <typeColor>`, leading 5px dot. Same type→color map as the rest of the app (Bug → `--red`, Feature → `--accent`, Chore → `--amber`).
- `#<taskId>` — mono 10.5px / 600, `var(--text-faint)`, `flex: 0 0 auto`.
- spacer (`flex: 1`).
- **state pill** — 10px / 700, padding `1px 8px`, same pill recipe, state→color map unchanged (Active → `--green`, New → `--blue`, In Progress → `--amber`, Resolved → `--accent`, Closed → `--text-faint`).

Row 2:
- **task title** — 13.5px / 700, line-height 1.32, `text-wrap: pretty`, `color: var(--text)`. Wraps; clamp at **2 lines** (`-webkit-line-clamp: 2`). `title` attribute = the branch name.

### 4.3 Group header — no task

Row 1: fork glyph (12px, `var(--text-faint)`) + branch (or folder leaf for detached) in mono 12px / 500, `var(--text-muted)`, ellipsized, `flex: 1`.

Row 2, 11px:
- detached → italic `var(--text-faint)`, "detached · `<folder>`"
- untagged worktree → italic `var(--text-faint)`, "untagged worktree"
- path missing → `var(--red)`, "worktree path missing"

### 4.4 SessionRow

| Property | Value |
|---|---|
| box | full width, `border: none`, radius 8px, padding `6px 7px` |
| layout | row flex, `align-items: center`, gap 8px, `min-width: 0` |
| background | transparent |
| background (hover) | `var(--panel-2)` |
| background (active session) | `color-mix(in oklab, var(--accent) 12%, transparent)` |
| transition | `background .12s` |
| cursor | pointer |
| tooltip | `<session.title> · <branch>` — this is where the worktree/branch information now lives |

Children, in order:
1. **Agent tile** — 22×22, radius 7px, `background: color-mix(in oklab, <agentColor> 15%, transparent)`, 13px glyph in `<agentColor>`. Agent→color map unchanged (Claude `--accent`, Copilot `--blue`, Codex `--green`, ad-hoc `--amber`).
2. **Agent name** — 12px / 600, `color: var(--text)`, ellipsized, `flex: 1`, `min-width: 0`.
3. **Short status** — 11px / 600, `color: <statusColor>`, `white-space: nowrap`, `flex: 0 0 auto`.
4. **Status dot** — 8px circle, `<statusColor>`; when running also `box-shadow: 0 0 0 3px color-mix(in oklab, var(--green) 22%, transparent)` + `animation: pulse 1.8s ease-in-out infinite`.
5. **Actions** — 24×24 icon-only buttons, `1px solid var(--border)`, transparent background, `color: var(--text-faint)`, radius 7px, `flex: 0 0 auto`, each with a `title` tooltip. Clicks must `stopPropagation` so they don't change the selection.

| Session state | Buttons |
|---|---|
| running | **Stop** — filled stop-square 10px; hover `color: var(--red)`, `border-color: color-mix(in oklab, var(--red) 42%, var(--border))` |
| agent exited · shell | same **Stop** |
| stopped | **Respawn** — refresh 12px; hover `color: var(--accent-text)`, `border-color: color-mix(in oklab, var(--accent) 42%, var(--border))` · then **Remove** — trash 12px; hover red as above |
| path missing | **Remove** only |

Status colors are the v1 map, unchanged: running `--green`, shell `--amber`, stopped `--text-faint`, missing `--red`.

## 5. Removed from the rail

- Worktree name (`Code-#####`) — never shown in the rail; it stays in the terminal header cwd and the attribution strip, and is reachable via the row tooltip.
- Full branch path — same; plus it remains the header line for orphan groups, where it is the only name available.
- **Last-output preview** (the 2-line mono tail on stopped / path-missing cards) — dropped. Tail output is read in the terminal, which is one click away.
- 30×30 agent tile and the 13px session title — the tile is now 22×22 and the row shows the **agent name**. The editable session title survives as the row tooltip and as the terminal header title; rename still targets it.

## 6. Behavior

- **Select**: click a row → that session becomes active in the terminal (row tint + accent border on its group). Selecting does not expand or collapse anything.
- Groups are **always expanded**. No collapse affordance in this revision.
- Status changes must not reorder groups or rows.
- A stopped session keeps its row (inspect + respawn). Remove is the only thing that deletes a row, and only when stopped or path-missing.
- Keyboard: rows are the focusable elements (`button` or `role="option"`); ↑/↓ moves between rows across group boundaries in visual order.
- Accessibility: group = `role="group"` with `aria-label` = `#<id> <task title>` (or the branch for orphans); active row `aria-selected="true"`. Action buttons need `aria-label`s ("Stop Claude session", etc.) since they are icon-only.

## 7. Acceptance checklist

- [ ] Two agents on the same worktree render as **one** group with two rows; the task title and `#id` appear once.
- [ ] Two sessions on different worktrees of the same task ID also share one group; each row's tooltip shows its own branch.
- [ ] A detached session, an untagged worktree, and a path-missing session each render as their own single-row group with the right note.
- [ ] Task title wraps to at most 2 lines and does not push the rows out of view at 344px.
- [ ] Row actions do not change the active session when clicked.
- [ ] Starting and stopping sessions leaves group and row order stable.
- [ ] Selecting a row highlights the row and outlines its group; the terminal swaps stream.
- [ ] Both themes: pills, tiles, dots, and hover states legible in light and dark.

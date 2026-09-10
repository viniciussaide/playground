# Terminal Unicode Width & Grapheme Clustering Specification

## Problem Statement

The embedded agent terminals (xterm.js 6.0.0) render lines containing icons,
emojis or wide Unicode characters as garbled, hard-to-read text. The Claude
Code TUI is the loudest victim — its status gutter (first two columns), spinner
and vertical borders break — but the same corruption shows in ordinary output
that contains emojis. Selecting the text changes what is on screen, and the
first two columns plus the last column keep stale, fixed residue. Root cause is
two-layered:

1. xterm.js 6.0.0 computes cell width with the **Unicode 6** wcwidth tables by
   default (`UnicodeV6` in the shipped bundle), so modern emojis/icons are
   measured as 1 cell when they render as 2.
2. Even with the **Unicode 11** width tables, xterm measures each code point in
   isolation — it does not form grapheme clusters. An emoji-presentation
   sequence like `➡️` (U+27A1 + U+FE0F) or `❤️` (U+2764 + U+FE0F) has a
   width-1 base plus a zero-width variation selector: the terminal reserves 1
   cell while the font paints a 2-cell emoji. The following text is pulled one
   cell left ("space eaten"), and the re-render on selection re-measures and
   shifts the whole line.

Both were proven with a runtime probe against the installed bundles
(2026-09-10): `➡️` measures width **1** under Unicode 11 and width **2** under
the grapheme addon; `❓`/`🤖`/`👍`/`👎` measure width **2** under both.

## Goals

- [ ] Agent output containing emojis, icons and wide characters renders aligned and legible
- [ ] Emoji-presentation sequences (base + U+FE0F, e.g. `➡️`, `❤️`) occupy two cells and do not eat the following space
- [ ] Grapheme clusters (ZWJ families, regional pairs) render as one unit
- [ ] The Claude Code TUI gutter/borders render correctly (manual check)
- [ ] Selecting text no longer changes what is on screen
- [ ] No stale residue in the first two columns or the last column

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Upgrading `@xterm/xterm` past 6.0.0 | Same rationale as previous terminal work: new dependency, regression risk, and the width/cluster fix is delivered by the addon alone |
| Re-encoding or filtering agent output | The bytes are correct; the renderer is measuring them wrong. Patching content would hide the bug and corrupt TUIs |
| Changing the terminal font | INPUT-12 already pinned Cascadia Mono for the TUI corners; width, not glyph coverage, is the failure here |
| Ambiguous-width-as-wide mode (`ambiguousCharsAreWide`) | Not the reported failure; enabling it would widen characters that Windows Terminal renders narrow and cause a new class of mismatch |
| Windows Terminal / external terminal parity beyond rendering | App-embedded xterm only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| xterm 6.0.0 computes widths with Unicode 6 rules unless told otherwise | Register a modern provider through `term.unicode` | The shipped bundle contains `UnicodeV6` (`node_modules/@xterm/xterm/lib/*.js`, module 7428); the terminal exposes `term.unicode` (`IUnicodeHandling`) with `register()` + `activeVersion` | y |
| Unicode 11 width tables alone are **insufficient** | Use the grapheme addon, not the Unicode 11 addon | Runtime probe (2026-09-10): with `@xterm/addon-unicode11` active, `➡️` (U+27A1 U+FE0F) still measures **1** cell — the variation selector is not folded into the base width; the first attempt at this feature (commit `ada3a69`) fixed plain emojis but left VS16 sequences broken, reproducing the user's "space eaten" / reflow symptom | y |
| `@xterm/addon-unicode-graphemes` is the correct provider | `term.loadAddon(new UnicodeGraphemesAddon())` | Official xterm addon; ships a Unicode **15** provider **with grapheme clustering** (`UnicodeGraphemeProvider`); its `charProperties` explicitly treats `emoji_presentation_selector` (U+FE0F) as wide and joins ZWJ/regional sequences. Probe: `➡️` = width **2**, `🤖`/`👍`/`👎` = width **2** | y |
| The grapheme addon activates itself | No manual `activeVersion` line needed | Its `activate()` registers `'15'` and `'15-graphemes'` and sets `unicode.activeVersion = '15-graphemes'` | y |
| `term.unicode` is proposed API, gated behind `allowProposedApi` | Keep `allowProposedApi: true` in the `Terminal` options | The installed typings mark `IUnicodeHandling` "(EXPERIMENTAL)" and `allowProposedApi` defaults to `false` — accessing `term.unicode` without it throws `You must set the allowProposedApi option to true to use proposed API`, so the terminal would never open (verifier probe, 2026-09-10) | y |
| The grapheme addon is experimental; the risk is accepted | Use it | It is the only provider that fixes VS16/cluster cases, and its behavior matches modern terminals (Windows Terminal, VS Code). Plain Unicode 11 is not enough for the reported bug | y |
| `@xterm/addon-unicode-graphemes@0.4.0` is the right version | Latest stable (0.4.0) | Published 2025-12-22 alongside xterm 6.0.0; no declared dependencies; ships `UnicodeGraphemesAddon` implementing `ITerminalAddon` | y |
| The fix applies to **every** session, not per agent | One change in `TerminalPane`, which is the single terminal surface | The bug is renderer-side (measurement), not agent-side; all agents emit the same Unicode | y |
| The corruption is not caused by the font or the PTY env | No font/env change | INPUT-12 fixed glyph coverage (U+23BE/U+23BF corners) with Cascadia Mono; the remaining corruption is measurement, and it reproduces in plain emoji output (user-confirmed) | y |
| Validation is manual | User-run live session check | Renderer components are not unit-tested by repo convention (TESTING.md); the symptom is visual. A Node runtime probe against the installed bundles backs the width outcomes | y |
| Remaining implicit dimensions (auth, persistence, idempotency, rate limits, data lifecycle) | N/A for this scope — one renderer option change; no I/O | No storage, no network, no permissions boundary | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Agent output with icons/emojis renders legible ⭐ MVP

**User Story**: As a user running Claude (or any agent) in the embedded
terminal, I want lines containing icons, emojis and wide characters to align
with the cell grid, so that output is readable and the TUI layout holds.

**Why P1**: The reported bug — the corrupted text is the day-to-day agent output.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN the terminal renders a line containing a wide character (emoji, icon, or other width-2 code point) THEN the character SHALL occupy exactly two cells and the following text SHALL align to the cell grid. <!-- event-driven -->
2. WHEN the terminal renders an emoji-presentation sequence (a base character followed by U+FE0F, e.g. `➡️`) THEN it SHALL occupy two cells and SHALL NOT consume the following character's cell. <!-- event-driven -->
3. WHEN the terminal renders a grapheme cluster (ZWJ sequence, regional-indicator pair) THEN it SHALL occupy one grapheme's width and the following text SHALL align to the cell grid. <!-- event-driven -->
4. WHEN the terminal renders a line containing a combining mark or zero-width code point THEN it SHALL not advance the cursor or displace neighbouring text. <!-- event-driven -->
5. WHEN the user selects terminal output that contains wide characters THEN the on-screen text SHALL remain unchanged. <!-- event-driven -->
6. WHILE the terminal is rendered, its active Unicode version SHALL be the grapheme provider's version. <!-- state-driven -->

**Independent Test**: In a live agent session, print `? ➡️ 🤖 👍 👎 fima` — every glyph aligns, the space before `fima` is intact, selecting the line does not reflow it, and no stale marks sit in the first two or last column.

---

### P1: Claude Code TUI renders its gutter and borders correctly ⭐ MVP

**User Story**: As a user running the Claude Code TUI, I want the status
gutter (first two columns), spinner and vertical borders to hold their shape,
so the interactive layout stays usable while the agent works.

**Why P1**: The most visible manifestation; the TUI redraws constantly, so the
corruption is in front of the user the whole session.

**Acceptance Criteria**:

1. WHEN the Claude Code TUI draws its status icons in the first two columns THEN those columns SHALL keep exactly the TUI's intended content and SHALL NOT show stale residue as lines scroll. <!-- event-driven -->
2. WHEN the Claude Code TUI draws vertical borders at the viewport edges THEN the borders SHALL render as a single continuous column and SHALL NOT leave ghost glyphs on the neighbouring column. <!-- event-driven -->
3. WHEN the TUI redraws (spinner tick, line scroll, selection) THEN previously rendered lines SHALL be repainted cleanly with no leftover glyph fragments. <!-- event-driven -->

**Independent Test**: Open a Claude Code session and let it run — the left status gutter and right border stay crisp through spinner ticks, scrolls and selections; no ghost characters accumulate on the edges.

---

## Edge Cases

- IF a wide character lands on the last column of the viewport THEN it SHALL wrap or clip per xterm's own wrapping rules, and SHALL NOT bleed into the following line's residue. <!-- unwanted-behavior -->
- IF output mixes wide, narrow and clustered characters on one line THEN the cumulative alignment SHALL match the active provider's widths cell-by-cell. <!-- unwanted-behavior -->
- IF the active Unicode version cannot be set (addon missing at runtime) THEN the terminal SHALL keep the default version and SHALL NOT crash. <!-- unwanted-behavior -->
- IF the user switches sessions (pane unmount/remount) THEN the new terminal SHALL activate the same provider. <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| UNIC-01 | P1: legible output | Execute | Implementing |
| UNIC-02 | P1: legible output | Execute | Implementing |
| UNIC-03 | P1: legible output | Execute | Implementing |
| UNIC-04 | P1: legible output | Execute | Implementing |
| UNIC-05 | P1: legible output | Execute | Implementing |
| UNIC-06 | P1: legible output | Execute | Implementing |
| UNIC-07 | P1: Claude TUI | Execute | Implementing |
| UNIC-08 | P1: Claude TUI | Execute | Implementing |
| UNIC-09 | P1: Claude TUI | Execute | Implementing |
| UNIC-10 | Edge | - | Implementing |
| UNIC-11 | Edge | - | Implementing |
| UNIC-12 | Edge | - | Implementing |
| UNIC-13 | Edge | - | Implementing |

**ID format:** `UNIC-[NUMBER]`

**Coverage:** 13 total, all mapped at Execute.

---

## Success Criteria

- [ ] `? ➡️ 🤖 👍 👎 fima` in a live agent session renders aligned (the space before `fima` intact), stays stable on selection, and leaves no edge residue
- [ ] The Claude Code TUI gutter and borders hold through spinner ticks, scrolls and selections
- [ ] Gate (`typecheck && lint && test`) stays green
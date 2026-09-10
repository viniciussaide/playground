# Terminal Copy & Undo Fixes Specification

## Problem Statement

Three chords in the embedded terminal fight the user instead of helping. Ctrl+Z
never undoes anything, because the app forwards the raw SUB byte (0x1A) and
Claude Code's undo is bound to `Ctrl+_` (0x1F) — Ctrl+Z is suspend, which
ConPTY does not implement. Ctrl+C copies only while a selection exists at the
instant of the keypress; the agent TUI redraws constantly and wipes the
selection, so the second press of the reflexive Ctrl+C-Ctrl+C sends SIGINT and
kills the running agent. And right-click does nothing at all — the terminal
pane has no mouse handler, so the copy-on-right-click habit from Windows
Terminal silently fails here.

## Goals

- [ ] Ctrl+Z undoes the last edit in the agent's input box
- [ ] Hammering Ctrl+C after a copy never interrupts the running agent
- [ ] A deliberate Ctrl+C still sends SIGINT
- [ ] Right-click copies the selection, or pastes when there is none

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Ctrl+Z as job control (SIGTSTP / suspend) | ConPTY has no job control; the app is Windows-only (AD-005). Reclaiming the chord for undo costs nothing here |
| Redo (Ctrl+Shift+Z / Ctrl+Y) | Claude Code has no redo to send it to; the chord keeps passing through untouched |
| Undo inside the app's own React inputs (branch name, config forms) | Terminal scope only; those are native inputs with browser undo already |
| A right-click context menu with explicit Copy / Paste / Clear items | The user chose the single-click Windows Terminal behavior; a menu is more clicks for the same two actions |
| Per-agent bytes for Ctrl+C / Ctrl+X / Ctrl+V | Investigated 2026-09-09 and there is nothing to normalize: all three are standard control codes (`0x03`, `0x18`, `0x16`) and no agent disagrees on them. Undo was the exception precisely because `Ctrl+_` is a *different key*, not a different meaning of the same one. The real risk is the app **swallowing** a chord an agent needs — pinned by TCU-24 instead of by new machinery |
| Middle-click paste (X11 habit) | Not requested; no primary-selection concept on Windows |
| Guarding multi-line pastes behind a confirmation | `term.paste` already brackets the paste; no reported pain |
| Upgrading `@xterm/xterm` past 6.0.0 | Same rationale as the previous terminal work: new dependency, regression risk, and none of these three fixes need it |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Claude Code's undo byte is `Ctrl+_` = US, 0x1F | Send `\x1f` on Ctrl+Z | Claude Code binds undo to `Ctrl+_` (and the `Ctrl+-` / `Ctrl+Shift+_` aliases that produce the same byte); Ctrl+Z is documented as suspend and is a known crash/no-op on Windows (anthropics/claude-code #4035, #8626) | y |
| The agent registry is **persisted** in `config.json` and its array replaces the seed list wholesale | Resolve the undo byte from the entry's `command` when it declares no `undoByte` | Seeding the field fixed nobody on an existing install: the user's saved registry had four agents, none with `undoByte`, so every one fell back to `0x1A` and Claude's undo broke (UAT 2026-09-09). `command` is the entry's stable identity — it survives a rename and every persisted entry has one | y |
| ~~Ctrl+Z is translated in **every** session~~ **FALSIFIED by UAT 2026-09-09.** The byte is **per agent**, declared in the agent registry | `AgentDef.undoByte`, resolved by `undoByteFor(agents, name)`; unset falls back to `0x1A` | Translating for everyone fixed Claude and broke opencode, whose `input_undo` default is literally `ctrl+z` — its docs say that binding exists *because* Windows terminals have no POSIX suspend. Codex undoes with Esc Esc and Copilot documents no Ctrl+Z undo, so both take the plain byte. The default is the untouched terminal byte, so the app deviates only where an agent is known to need it — and the asymmetry matters: `0x1F` is merely ignored by a TUI that does not want it, while `0x1A` has been reported to crash Claude Code on Windows | y |
| Grace window after a copy is **800 ms** | 800 ms | Long enough to absorb a double or triple tap at human hammer speed (~150-300 ms apart), short enough that a deliberate "stop this agent" is one pause away | y |
| A Ctrl+C swallowed by the grace window **restarts** the window | Restart on every swallowed press | Without this, hammering at 300 ms intervals walks past a fixed 800 ms window and still fires SIGINT on the fourth press — the exact bug being fixed. The window means "800 ms of silence since the last Ctrl+C", not "800 ms since the copy" | y |
| A right-click with no xterm selection does **nothing** while the agent owns the mouse | `term.modes.mouseTrackingMode !== 'none'` suppresses the paste branch and leaves the event to xterm/the agent | Instrumented in the running app after three failed fixes: `live 0, dom 0, remembered 0, hasSelection false`, one handler call per click. A full-screen TUI enables mouse reporting (DECSET 1000/1002/1006), xterm forwards drags to it, and the highlight on screen is drawn by the agent — unreadable from this side by any API. Pasting there injected the clipboard into the agent's prompt every time the user meant to copy. Shift+drag still yields a real xterm selection, which copies normally. **Withdrawn with this row:** the one-action-per-gesture lock (TCU-22) and the DOM-selection fallback — the instrumentation showed one handler call per click and a DOM selection of zero every time | y |
| A Shift+drag selection is cleared on button release, so the right-click must read a **remembered** selection | Track every non-empty selection via `term.onSelectionChange`; a left click or a completed copy forgets it | Measured with `mouseTracking: "any"`: the user reported the highlight vanishing the instant the left button is released, and all four readings showed `selection 0`. Remembering is therefore what makes Shift+drag copy at all. It was briefly removed as dead code — wrongly, because the measurements behind that call were all taken WITHOUT Shift, where no xterm selection ever exists (TCU-25) | y |
| A right-click copy shows a transient confirmation in the pane | ~1.2 s (`COPIED_FEEDBACK_MS`) "Copiado" chip, **top-right** | Top-right, above every xterm layer (`z-index: 20` vs xterm's 11): the bottom edge is where both agent TUIs draw their input box. The selection is already gone when the copy happens, so the action left no visible trace at all and a successful copy was indistinguishable from nothing happening — which repeatedly muddied the UAT reports themselves (TCU-28) | y |
| Right-click copy **clears** the selection afterwards | Clear it | Matches Windows Terminal, and it is what makes the copy-or-paste toggle usable: without clearing, right-click can never reach the paste branch | y |
| Right-click copy also opens the Ctrl+C grace window | Yes | It is a copy; a user who right-click-copies and then reflexively presses Ctrl+C deserves the same protection | y |
| A Ctrl+Shift+C with **nothing** selected also opens the grace window | Yes | The window opens on the copy *attempt*, not on its success (TCU-16 already says so for a failed clipboard write). Anyone who reached for a copy chord was not reaching for SIGINT, so the cheap read is the safe one. Found by the verifier as a case the AC wording did not cover | y |
| The classifier stays a pure function | Time and last-copy timestamp are passed in as arguments, not read from `Date.now()` inside | `terminal-keys.ts` is the repo's tested seam (`src/renderer/src/lib/*` = unit-tested by convention); a pure `(event, hasSelection, grace)` keeps the grace-window logic testable without fake timers. The mutable `lastCopyAt` lives in the pane. Every value an AC constrains — the 800 ms bound, the undo byte — is exported from the lib so it can be asserted there rather than hidden in the untested component | y |
| Grace-window state is per pane instance | Reset when the pane unmounts or `sessionId` changes | The state is a plain object literal declared inside the `useEffect` body keyed on `sessionId`, not a `useRef`: a ref survives re-renders and would leak the window across a session switch, which is exactly what TCU-09 forbids | y |
| Verification split | Unit tests for the classifier + mouse-action decision; the `TerminalPane` wiring is hand-verified | Repo convention (renderer components have no unit tests; `.specs/features/terminal-input-fixes/validation.md` set the precedent for impl-evidence on the pane) | y |
| Remaining implicit dimensions (auth, persistence, idempotency, rate limits, data lifecycle) | N/A for this scope — renderer key/mouse handling with no I/O beyond the clipboard | No storage, no network, no permissions boundary | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ctrl+Z undoes in the agent input ⭐ MVP

**User Story**: As a user typing a long prompt into Claude Code, I want Ctrl+Z
to undo my last edit, so that a bad paste or deletion is recoverable without
retyping the prompt.

**Why P1**: The chord is dead today and the recovery cost is a whole prompt.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN the user presses Ctrl+Z (no Shift, no Alt) in the terminal THEN the app SHALL send the undo byte the session's agent declares in the registry. <!-- event-driven -->
2. WHERE the session's agent is Claude Code, the byte sent on Ctrl+Z SHALL be `0x1F` (US) and SHALL NOT be `0x1A` (SUB). <!-- optional-feature -->
3. WHEN the user presses Ctrl+Shift+Z in the terminal THEN the app SHALL forward the chord unchanged to the PTY. <!-- event-driven -->

**Independent Test**: In a Claude Code session, type `abc`, delete it, press Ctrl+Z — the text comes back and the session keeps running. Repeat in an opencode session — the text comes back there too.

---

### P1: Ctrl+C hammering never kills the agent ⭐ MVP

**User Story**: As a user copying terminal output, I want to press Ctrl+C
twice out of habit without interrupting the running agent, so that copying is
not a coin flip on whether my work survives.

**Why P1**: The reported bug, and its failure mode is destructive — a killed agent run.

**Acceptance Criteria**:

1. WHEN the user presses Ctrl+C while the terminal has a non-empty selection THEN the app SHALL copy the selection to the clipboard and SHALL NOT send SIGINT to the PTY. <!-- event-driven -->
2. WHEN the app copies a selection from the terminal THEN it SHALL record that copy's timestamp as the start of the grace window. <!-- event-driven -->
3. WHILE fewer than `COPY_GRACE_MS` (800 ms) have elapsed since the last Ctrl+C that the app handled, WHEN the user presses Ctrl+C without a selection THEN the app SHALL discard the chord and SHALL NOT send SIGINT to the PTY. <!-- complex -->
4. WHEN the app discards a Ctrl+C under the grace window THEN it SHALL restart the grace window from that press. <!-- event-driven -->
5. WHEN the user presses Ctrl+C without a selection and `COPY_GRACE_MS` (800 ms) or more have elapsed since the last Ctrl+C the app handled THEN the app SHALL forward the chord to the PTY as SIGINT. <!-- event-driven -->
6. WHEN the terminal pane's session changes or the pane unmounts THEN the grace window SHALL be discarded. <!-- event-driven -->

**Independent Test**: With a Claude Code session running, select output and press Ctrl+C four times in quick succession — the clipboard holds the selection and the agent is still running; wait a second, press Ctrl+C once — the agent is interrupted.

---

### P1: Right-click copies or pastes ⭐ MVP

**User Story**: As a user, I want right-click to copy my selection and to paste
when nothing is selected, so that the terminal behaves like Windows Terminal.

**Why P1**: Reported as a regression from the user's expectation, and it is the
mouse-side escape hatch from the Ctrl+C problem above.

**Acceptance Criteria**:

1. WHEN the user right-clicks the terminal while it has a non-empty selection THEN the app SHALL copy the selection to the clipboard. <!-- event-driven -->
2. WHEN the app copies a selection via right-click THEN it SHALL clear the terminal's selection. <!-- event-driven -->
0. WHEN a Shift+drag selection has already been cleared by the button release THEN a right-click SHALL copy the last non-empty selection the terminal reported. <!-- event-driven --> `TCU-25`
0. WHEN the app copies via right-click THEN it SHALL show a confirmation in the pane for `COPIED_FEEDBACK_MS` (1200 ms) and then hide it. <!-- event-driven --> `TCU-28`
3. WHEN the app copies a selection via right-click THEN it SHALL start the Ctrl+C grace window from that copy. <!-- event-driven -->
4. WHILE the agent has not enabled mouse reporting, WHEN the user right-clicks the terminal with no selection THEN the app SHALL read the system clipboard and paste its text into the PTY. <!-- complex -->
0. WHILE the agent has enabled mouse reporting, WHEN the user right-clicks the terminal with no xterm selection THEN the app SHALL take no clipboard action and SHALL let the click reach the agent. <!-- complex --> `TCU-27`
5. WHEN the user right-clicks anywhere in the terminal pane THEN the app SHALL suppress the default browser context menu. <!-- event-driven -->

**Independent Test**: Select terminal output, right-click — the clipboard holds it, the highlight is gone, no menu appears; right-click again with nothing selected — the clipboard text appears at the prompt.

---

## Edge Cases

- IF the session's agent is absent from the registry (ad-hoc, deleted or renamed) THEN the app SHALL send `0x1A`, the byte an untouched terminal sends. <!-- unwanted-behavior --> `TCU-21`
- IF the agent's registry entry declares no undo byte THEN the app SHALL resolve one from the entry's command, and SHALL fall back to `0x1A` when the command is unknown. <!-- unwanted-behavior --> `TCU-23`
- The app SHALL forward Ctrl+X and Escape to the PTY untouched in every state, including while the grace window is open. <!-- ubiquitous --> `TCU-24`
- WHEN the user left-clicks the terminal THEN the app SHALL forget the remembered selection. <!-- event-driven --> `TCU-26`
- IF the selection is empty or whitespace-only THEN the app SHALL treat it as no selection for both Ctrl+C and right-click. <!-- unwanted-behavior --> `TCU-15`
- IF the clipboard write fails while copying THEN the app SHALL log the error, leave the PTY untouched, and still open the grace window. <!-- unwanted-behavior --> `TCU-16`
- IF the clipboard read fails on a right-click paste THEN the app SHALL log the error and paste nothing (no crash, no partial paste). <!-- unwanted-behavior --> `TCU-17`
- IF the system clipboard is empty on a right-click paste THEN the app SHALL paste nothing and SHALL NOT emit any byte to the PTY. <!-- unwanted-behavior --> `TCU-18`
- WHEN the user presses Ctrl+Shift+C with a selection THEN the app SHALL keep copying it, unchanged from today's behavior. <!-- event-driven --> `TCU-19`
- WHILE the grace window is open, the app SHALL keep forwarding every chord other than a selection-less Ctrl+C to the PTY normally. <!-- state-driven --> `TCU-20`

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TCU-01 | P1: Ctrl+Z | Execute | Implementing |
| TCU-02 | P1: Ctrl+Z | Execute | Implementing |
| TCU-03 | P1: Ctrl+Z | Execute | Implementing |
| TCU-04 | P1: Ctrl+C | Execute | Implementing |
| TCU-05 | P1: Ctrl+C | Execute | Implementing |
| TCU-06 | P1: Ctrl+C | Execute | Implementing |
| TCU-07 | P1: Ctrl+C | Execute | Implementing |
| TCU-08 | P1: Ctrl+C | Execute | Implementing |
| TCU-09 | P1: Ctrl+C | Execute | Implementing |
| TCU-10 | P1: Right-click | Execute | Implementing |
| TCU-11 | P1: Right-click | Execute | Implementing |
| TCU-12 | P1: Right-click | Execute | Implementing |
| TCU-13 | P1: Right-click | Execute | Implementing |
| TCU-14 | P1: Right-click | Execute | Implementing |
| TCU-15 | Edge | - | Implementing |
| TCU-16 | Edge | - | Implementing |
| TCU-17 | Edge | - | Implementing |
| TCU-18 | Edge | - | Implementing |
| TCU-19 | Edge | - | Implementing |
| TCU-20 | Edge | - | Implementing |
| TCU-21 | Edge | - | Implementing |
| TCU-23 | Edge | - | Implementing |
| TCU-24 | Edge | - | Implementing |
| TCU-25 | P1: Right-click | Execute | Implementing |
| TCU-26 | Edge | - | Implementing |
| TCU-27 | P1: Right-click | Execute | Implementing |
| TCU-28 | P1: Right-click | Execute | Implementing |

**ID format:** `TCU-[NUMBER]`

**Coverage:** 27 total (TCU-22 withdrawn — see Assumptions), mapped at Execute.

---

## Success Criteria

- [ ] Four rapid Ctrl+C presses after a selection leave the agent running and the clipboard filled
- [ ] One Ctrl+C after a one-second pause interrupts the agent
- [ ] Ctrl+Z restores the previous state of the input box in Claude Code **and** in opencode
- [ ] Right-click copies with a selection and pastes without one, and never shows a context menu

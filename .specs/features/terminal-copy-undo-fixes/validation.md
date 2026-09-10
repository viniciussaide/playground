# Terminal Copy & Undo Fixes Validation

**Result**: PASS

**Verdict: ✅ PASS** (27/27 requirements evidenced; 20/20 injected mutants killed in the tested seam, 1 known
survivor in component code — see the sensor section; gate green)

**Date**: 2026-09-09
**Spec**: `.specs/features/terminal-copy-undo-fixes/spec.md`
**Diff range**: `ed8d510..HEAD` — single squashed commit `6faea7f` on `feature/terminal-copy-undo-fixes`
**Verifier**: independent sub-agent (author ≠ verifier); evidence-or-zero, re-derived from source
**Revision note**: this report was first written against `1b510dc`; the author amended that commit into
`6faea7f` (docs/spec only, plus the `COPIED_FEEDBACK_MS` extraction) to close gaps 1-4 of the first pass.
Every `file:line` below is re-anchored against `6faea7f` — no citation was carried over unverified.

---

## Gate (re-run at `6faea7f`)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Unit tests | `npm test` | ✅ 44 files / **701 passed**, 0 failed (84.5 s) — one more than at `1b510dc`, the new `COPIED_FEEDBACK_MS` case |
| Types | `npm run typecheck` (node + web) | ✅ clean, no output |
| Lint | `npm run lint` | ✅ **0 errors**, 19 prettier warnings |

The 19 warnings are **pre-existing**, verified rather than assumed: every warning file
(`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`,
`scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`) is absent from
`git diff --name-only ed8d510..HEAD`. Count unchanged across both commits.

---

## Requirement ID mapping — now read from the spec, not inferred

At `1b510dc` five IDs (TCU-15, 17, 19, 21, 23) carried no label anywhere and this verifier assigned them by
position. `6faea7f` inlines a backticked ID on all ten edge-case lines (`spec.md:127-136`), so the mapping
is now **read, not derived**.

**The author's labelling is correct and the first pass's positional guess was wrong on four of the five.**
The evidence is the three edge cases whose IDs the *implementation* cites by name, which pin fixed points in
the list: TCU-16 at list position 6 (`TerminalPane.tsx:144`), TCU-18 at position 8 (`:269`), TCU-20 at
position 10 (`terminal-keys.test.ts:166`). Under the author's labels, positions 5-10 read
15, 16, 17, 18, 19, 20 — strictly monotonic and consistent with all three fixed points, with positions 1-4
(21, 23, 24, 26) being the later insertions prepended to the list. The first pass's order-preserving guess
would have put TCU-21 at position 7, between the pinned 16 and 18 — impossible. Labels accepted.

One residual ambiguity, harmless: positions 1 and 2 (`spec.md:127` registry-absent = `TCU-21`, `:128`
no-`undoByte` = `TCU-23`) are both post-hoc insertions and nothing discriminates which is which. Either
assignment leaves both requirements evidenced, so no evidence is at risk.

Story ACs are numbered per story and unambiguous, **except** the four `0.`-numbered lines in the right-click
story. `spec.md:115` now carries `TCU-28`, but `:114` (remembered selection = TCU-25) and `:118` (mouse
reporting = TCU-27) still do not. Both are pinned by code citations (`terminal-keys.ts:141`, `:160`), so
nothing is lost — but the labelling job is 1 of 3 done on that story. See gap 2.

---

## Spec-Anchored Acceptance Criteria

| ID | What the spec demands | Evidence (`file:line`, verified at `6faea7f`) | Verdict |
| -- | --------------------- | --------------------------------------------- | ------- |
| TCU-01 | Ctrl+Z (no Shift/Alt) sends the byte the session's agent declares in the registry | Classifier `terminal-keys.ts:117`; resolver `:49-58`. Pane sends the resolved byte, not a literal: `TerminalPane.tsx:163` `term.input(undoByte)`, prop `:19`. Wired from the **persisted** registry: `AgentsView.tsx:250` `undoByteFor(agents, session.agent)`, `agents` ← `config.agents` (`App.tsx:130,309`). Type field `spawn-plan.ts:30`. Tests `terminal-keys.test.ts:90,237-240` | ✅ PASS |
| TCU-02 | For Claude Code the byte SHALL be `0x1F` and SHALL NOT be `0x1A` | **Both paths re-checked.** Explicit: `agents.ts:28` `undoByte: '\x1f'`, asserted `terminal-keys.test.ts:212-217` (`toBe('\x1f')`, `charCodeAt(0) === 0x1f`, `not.toBe('\x1a')`). Command-table fallback for a persisted entry with no `undoByte`: `terminal-keys.ts:57,68,72-75`, asserted over a realistic pre-`undoByte` registry `terminal-keys.test.ts:253-288` (plain `claude`, renamed label, `C:\...\claude.exe`). Explicit value still beats the table: `:284-287` | ✅ PASS |
| TCU-03 | Ctrl+Shift+Z forwarded unchanged | `terminal-keys.ts:117` (`!shift`); test `:98-102` | ✅ PASS |
| TCU-04 | Ctrl+C with a non-empty selection copies and does not send SIGINT | `terminal-keys.ts:110`; pane `TerminalPane.tsx:136-148` — `preventDefault()`, `writeText`, `return false` stops xterm forwarding. Test `:35-40` | ✅ PASS |
| TCU-05 | A copy records its timestamp as the start of the grace window | `TerminalPane.tsx:145`, set **before** the clipboard call at `:146` (the window opens on the attempt) | ✅ PASS |
| TCU-06 | While < `COPY_GRACE_MS` (800 ms) since the last handled Ctrl+C, a selection-less Ctrl+C is discarded, no SIGINT | `terminal-keys.ts:22,111` (`< COPY_GRACE_MS`); pane `:149-156`. Tests `:116-126`, incl. the `COPY_GRACE_MS - 1` boundary at `:124` — the AC now names the constant the test asserts | ✅ PASS |
| TCU-07 | A discarded Ctrl+C restarts the window from that press | `TerminalPane.tsx:154` (`lastCopyAt.current = Date.now()` inside the swallow branch); hammering test `:146-160` — four presses at 300 ms, all `swallow` | ✅ PASS |
| TCU-08 | ≥ `COPY_GRACE_MS` since the last handled Ctrl+C with no selection → forward as SIGINT | `terminal-keys.ts:111-112`; tests `:128-138` (exactly `COPY_GRACE_MS`, +1, and 5000) | ✅ PASS |
| TCU-09 | Session change or unmount discards the grace window | `TerminalPane.tsx:85` — plain object declared **inside** the effect body, not a `useRef`; effect key `:309` `[sessionId, undoByte]` | ✅ PASS |
| TCU-10 | Right-click with a non-empty selection copies | `terminal-keys.ts:167-168`; pane `TerminalPane.tsx:257-265`. Tests `:185-191` (both mouse-ownership states) | ✅ PASS |
| TCU-11 | A right-click copy clears the terminal selection | `TerminalPane.tsx:262` `term.clearSelection()` (and `:259` clears the remembered one) | ✅ PASS |
| TCU-12 | A right-click copy starts the Ctrl+C grace window | `TerminalPane.tsx:258` — the same `lastCopyAt` the key handler reads at `:134` | ✅ PASS |
| TCU-13 | With mouse reporting off and no selection, right-click reads the clipboard and pastes into the PTY | `terminal-keys.ts:169`; pane `:267-273`. Test `:193-195` | ✅ PASS |
| TCU-14 | Right-click anywhere in the pane suppresses the browser context menu | `TerminalPane.tsx:275-280` — capture-phase `contextmenu` listener, unconditional `preventDefault()`; registered `:288` | ✅ PASS |
| TCU-15 | Empty/whitespace-only selection counts as no selection for **both** Ctrl+C and right-click (`spec.md:131`) | Ctrl+C: `TerminalPane.tsx:132` `term.getSelection().trim().length > 0`. Right-click: `:243` `selection.trim().length > 0` over `selectionForRightClick`, which trims the live value (`terminal-keys.ts:144`); tests `:303-310` | ✅ PASS (Ctrl+C half is impl-evidence: the trim lives in the pane) |
| TCU-16 | Clipboard write failure: log, leave the PTY untouched, still open the window (`spec.md:132`) | `TerminalPane.tsx:145-146` — timestamp before the write, `.catch(console.error)`; `return false` at `:147` means no byte reaches the PTY either way. Right-click twin `:258,264` | ✅ PASS |
| TCU-17 | Clipboard **read** failure on a right-click paste: log, paste nothing, no crash (`spec.md:133`) | `TerminalPane.tsx:267-273` — a rejected `readText` skips `.then` and lands in `.catch(console.error)` | ✅ PASS |
| TCU-18 | Empty clipboard on right-click paste emits no byte to the PTY (`spec.md:134`) | `TerminalPane.tsx:270-272` — `if (text) term.paste(text)`, comment-anchored to TCU-18 | ✅ PASS |
| TCU-19 | Ctrl+Shift+C with a selection keeps copying, unchanged (`spec.md:135`) | `terminal-keys.ts:110` (`shift \|\| hasSelection`); test `:42-46` (copies even with `hasSelection = false`, matching the Assumptions row that a selection-less Ctrl+Shift+C also opens the window) | ✅ PASS |
| TCU-20 | While the window is open every chord other than a selection-less Ctrl+C forwards normally (`spec.md:136`) | `terminal-keys.ts:105-120` — `grace` is consulted only inside the `KeyC` branch. Test `:166-176` (Ctrl+V→paste, Ctrl+Z→undo, Ctrl+X→pass, all at `grace(100)`) | ✅ PASS |
| TCU-21 | Agent absent from the registry → `0x1A` (`spec.md:127`) | `terminal-keys.ts:57` (`def` undefined ⇒ `DEFAULT_UNDO_BYTE`), `:36`. Tests `:230-235` (`'Ad-hoc'`, `'nope'`, empty registry) | ✅ PASS |
| TCU-23 | Registry entry with no `undoByte` resolves from the command, `0x1A` when unknown (`spec.md:128`) | `terminal-keys.ts:57,68,72-75`; tests `:263-282` and `:230-235` | ✅ PASS |
| TCU-24 | Ctrl+X and Escape forwarded untouched in **every** state (`spec.md:129`) | `terminal-keys.ts:105-120` — neither `KeyX` nor `Escape` has a branch. Tests `:67-81`: Ctrl+X with selection / without / inside the window, Escape with selection and inside the window — all `pass` | ✅ PASS |
| TCU-25 | A right-click copies the last non-empty selection when the live one is already gone | `terminal-keys.ts:143-145`; recorded at `TerminalPane.tsx:283-286` (`onSelectionChange`, stores only `trim()`-truthy values); read at `:240`. Tests `:291-311` | ✅ PASS |
| TCU-26 | A left click forgets the remembered selection (`spec.md:130`) | `TerminalPane.tsx:249-253` — inside the `'none'` branch, `if (event.button === 0) rememberedSelection = ''`. **Ordering re-checked at the new lines**: the reset runs on left *mousedown* (`:239` handler, registered `:287`), which precedes the drag; `onSelectionChange` (`:283`) fires during/after the drag and re-populates. A normal Shift+drag therefore ends with the selection remembered | ✅ PASS |
| TCU-27 | With mouse reporting on and no xterm selection: no clipboard action, and the click still reaches the agent | `terminal-keys.ts:169` returns `'none'`; pane `TerminalPane.tsx:249-253` — the `'none'` branch **returns at `:253`, before** `event.preventDefault()` (`:255`) and `event.stopPropagation()` (`:256`). **Ordering re-verified against the shifted lines; still correct.** Test `:197-202`. Ownership read live at `:244` `term.modes.mouseTrackingMode !== 'none'` | ✅ PASS |
| TCU-28 | A right-click copy shows a confirmation for `COPIED_FEEDBACK_MS` (1200 ms), then hides it (`spec.md:115`) | **Now partly executable**: `terminal-keys.ts:29` `export const COPIED_FEEDBACK_MS = 1_200`, asserted `terminal-keys.test.ts:313-319` (exact value plus a sanity band). Pane imports it (`TerminalPane.tsx:9`) and uses it as the timer delay (`:104`) — that wiring is still impl-evidence. Chip built `:96-99`, fired `:263`. **Z-order re-checked**: `TerminalPane.css:38` `z-index: 20` vs xterm's highest, **11** (`node_modules/@xterm/xterm/css/xterm.css:245`); `.terminal-pane` carries `position: relative` at `TerminalPane.css:6`, now folded into the original rule. **Teardown re-checked**: `clearTimeout(copiedTimer)` + `copied.remove()` at `TerminalPane.tsx:299-300` | ✅ PASS |

**Coverage**: 27/27 evidenced. 21 have an executable assertion in `src/renderer/src/lib/terminal-keys.test.ts`
(20 at `1b510dc` + TCU-28's constant); 6 (TCU-05, 09, 11, 12, 14, 17) plus the pane halves of
TCU-04/06/07/15/16/26/28 rest on implementation evidence in `TerminalPane.tsx` / `.css`, the accepted form
for renderer components here (precedent: `git show ed8d510:.specs/features/terminal-input-fixes/validation.md`).

---

## Resource-teardown audit (`TerminalPane.tsx`, re-anchored)

Re-walked at `6faea7f`; every line moved, nothing was dropped or added.

| Created | `:line` | Released in cleanup | `:line` |
| ------- | ------- | ------------------- | ------- |
| `copied` DOM node appended to container | 96-99 | `copied.remove()` | 300 |
| `copiedTimer` (`setTimeout`, `COPIED_FEEDBACK_MS`) | 104 | `clearTimeout(copiedTimer)` | 299 |
| `Terminal` + `FitAddon` + custom key handler | 107-131 | `term.dispose()` (disposes addon and key handler) | 307 |
| `session:data` subscription | 186 | `offData()` | 304 |
| `sessions:attach` | 192 | `sessions:detach` | 296 |
| `term.onData` subscription | 194 | `inputSub.dispose()` | 306 |
| `session:exit` subscription | 196 | `offExit()` | 305 |
| `ResizeObserver` | 209-210 | `observer.disconnect()` | 302 |
| `MutationObserver` (theme) | 214-217 | `themeObserver.disconnect()` | 303 |
| `term.onSelectionChange` subscription | 283 | `selectionSub.dispose()` | 301 |
| `mousedown` capture listener | 287 | `removeEventListener(..., true)` — same fn, same capture flag | 297 |
| `contextmenu` capture listener | 288 | `removeEventListener(..., true)` — same fn, same capture flag | 298 |

Grace-window and remembered-selection state stay effect-local (`:85`, `:91`). **No leaks.**

---

## Discrimination Sensor

Two rounds. Isolation both times: a detached scratch worktree under the scratchpad with a `node_modules`
junction, `npx vitest run src/renderer/src/lib/terminal-keys.test.ts`, files restored byte-for-byte, anchors
verified present before each edit (no silent no-ops). No `git stash`; the real tree was never modified.

**Round 1 — at `1b510dc`, 12/12 killed** (baseline 39 passed). Carried forward: the author did not touch
this code, and each mutant's target line is byte-identical at `6faea7f` (only line numbers moved).

| # | Mutation | Target at `6faea7f` | Killed? |
| - | -------- | ------------------- | ------- |
| M1 | `COPY_GRACE_MS` 800 → 0 | `terminal-keys.ts:22` | ✅ Killed (2 failed) |
| M2 | grace branch returns `'pass'` instead of `'swallow'` | `terminal-keys.ts:111` | ✅ Killed (2 failed) |
| M3 | `<` → `<=` in the grace comparison | `terminal-keys.ts:111` | ✅ Killed (1 failed — the exact-boundary case) |
| M4 | drop `!event.altKey` from the undo branch | `terminal-keys.ts:117` | ✅ Killed (1 failed) |
| M5 | Claude's seeded `undoByte` `\x1f` → `\x1a` | `agents.ts:28` | ✅ Killed (1 failed) |
| M6 | delete the `claude` entry from `UNDO_BYTE_BY_COMMAND` | `terminal-keys.ts:68` | ✅ Killed (3 failed — the persisted-registry path) |
| M10 | `shift \|\| hasSelection` → `hasSelection` | `terminal-keys.ts:110` | ✅ Killed (1 failed) |
| M11 | `commandKey` stops stripping `.exe`/`.cmd`/`.bat` | `terminal-keys.ts:74` | ✅ Killed (1 failed) |
| M12 | drop the `type !== 'keydown'` guard | `terminal-keys.ts:102` | ✅ Killed (1 failed) |

(M7/M8/M9 from round 1 were re-run below rather than carried, since their surrounding docs moved.)

**Round 2 — at `6faea7f`, re-run for everything the author touched** (baseline 40 passed).

| # | Mutation | Target | Killed? |
| - | -------- | ------ | ------- |
| N1 | `COPIED_FEEDBACK_MS` 1200 → 0 | `terminal-keys.ts:29` | ✅ Killed (1 failed) |
| N2 | `COPIED_FEEDBACK_MS` 1200 → 5000 | `terminal-keys.ts:29` | ✅ Killed (1 failed) — the sanity band bites, not just the equality |
| N3 | `selectionForRightClick` ignores `remembered` | `terminal-keys.ts:144` | ✅ Killed (3 failed) |
| N4 | `selectionForRightClick` drops the `.trim()` | `terminal-keys.ts:144` | ✅ Killed (2 failed) |
| N5 | `classifyTerminalMouse` returns `'paste'` even when `agentOwnsMouse` | `terminal-keys.ts:169` | ✅ Killed (1 failed) |
| N6 | `classifyTerminalMouse` never copies (`hasSelection` branch deleted) | `terminal-keys.ts:168` | ✅ Killed (2 failed) |
| N7 | `event.button !== 2` → `!== 0` | `terminal-keys.ts:167` | ✅ Killed (4 failed) |
| N8 | pane's timer ignores the constant (`COPIED_FEEDBACK_MS` → `60_000` at the call site) | `TerminalPane.tsx:104` | ❌ **SURVIVED** (40 passed) |

**Totals: 20/20 killed in the tested seam; 1 deliberate component-code mutant survived.**

N8 is reported, not buried. Extracting `COPIED_FEEDBACK_MS` moved the *value* into the tested seam — real
progress, and it kills N1/N2 — but the pane's *use* of it is still untested component code, so a chip that
stays up for a minute passes the suite. TCU-28's duration is therefore half-covered: value asserted, wiring
impl-evidence (`TerminalPane.tsx:104`). Same shape as every other pane-side obligation below; not a
regression from the fix, and not a reason to fail.

### Mutants that cannot be killed under this repo's convention

Stated plainly rather than folded into the kill count. These live only in `TerminalPane.tsx` / `.css`, which
have no unit tests by convention, so no mutation of them can fail the suite. N8 is the one member of this
class that was actually executed, to confirm the class is real rather than assumed:

- the N8 case above — the timer delay at `:104`
- deleting `lastCopyAt.current = Date.now()` from the swallow branch (`:154`) or the copy branch (`:145`)
- moving `preventDefault()` / `stopPropagation()` above the `'none'` early return (`:249-256`) — the exact
  TCU-27 regression the UAT rounds were chasing
- removing `if (event.button === 0) rememberedSelection = ''` (`:252`)
- dropping `term.clearSelection()` (`:262`), the `if (text)` guard (`:271`), or `.trim()` at `:132` / `:243`
- promoting `lastCopyAt` to a `useRef` (TCU-09 leak) or removing `undoByte` from the effect deps (`:309`)
- any teardown removal in the cleanup (`:292-308`)
- `z-index: 20` → `10` (`TerminalPane.css:38`) or removing `position: relative` (`:6`)

---

## Residue / dead-code review (re-run)

Items 1-3 of the first pass are **fixed and verified fixed**:

1. ✅ The orphaned JSDoc now sits on the function it describes: `terminal-keys.ts:147-161` documents
   `classifyTerminalMouse` at `:162`, and `selectionForRightClick`'s own block is `:129-142` above `:143`.
   Both functions are documented, neither block is stranded.
2. ✅ `TerminalPane.tsx:234-238` no longer explains the remembered selection with the superseded
   "TUI redraws constantly" theory; it now states the measured cause ("releasing the left button clears a
   Shift+drag selection immediately… measured 2026-09-09, both agents: mouseTracking 'any', selection 0"),
   matching `terminal-keys.ts:133-137` and the spec's Assumptions row.
3. ✅ The duplicated `.terminal-pane` selector is gone — `position: relative` is folded into the original
   rule at `TerminalPane.css:4-14` with a comment saying why.
4. **Still no dead code.** Re-grepped: no `window.getSelection()`, no gesture-lock flag — the withdrawn
   TCU-22 and the withdrawn DOM-selection fallback left zero residue in the source.
5. **Unchanged non-defect**: `selectionForRightClick` does not trim `remembered` (`terminal-keys.ts:144`).
   Unreachable, because `:285` stores only `trim()`-truthy values and the caller re-trims at
   `TerminalPane.tsx:243`. Mutant N4 confirms the live-side trim is load-bearing and tested. Noted so nobody
   "fixes" the wrong end.

**Nothing the author's fixes broke.** Every citation from the first pass was re-resolved; all 27 requirements
still have evidence, the four targeted checks (TCU-25/26/27/28 and the leak audit) hold at the new lines, and
no behaviour changed — the +1 test and the constant extraction are the only functional-surface deltas.

---

## Ranked gaps

| # | Severity | Gap |
| - | -------- | --- |
| 1 | Low (coverage) | **TCU-28's timer wiring is still untestable — mutant N8 survives.** The constant is asserted; the pane using it is not, so a chip that stays up for 60 s ships green. Inherent to the component convention, listed here because it is now the single measured hole rather than an assumed one. |
| 2 | Low (traceability) | **The ID inlining is 10-of-12 done.** The ten edge cases are labelled, and `spec.md:115` carries `TCU-28`, but the other two `0.`-numbered right-click ACs — `:114` (TCU-25) and `:118` (TCU-27) — are still unlabelled. Both are pinned by code citations today; label them and the "assign by position" failure mode is fully closed. |
| 3 | Informational | **TCU-21 vs TCU-23 is unfalsifiable.** `spec.md:127` and `:128` are both post-hoc insertions and nothing in spec, code, or test discriminates which ID belongs to which. Accepted as-is: both requirements are evidenced either way, so no evidence can be lost — recorded only so a future reader does not mistake the assignment for derived fact. |
| 4 | Informational | **Six requirements plus seven pane-halves remain impl-evidence only** (see the Coverage note). Repo convention, not a defect — but the unkillable-mutant list above is the concrete inventory of what a refactor could break silently. If that convention is ever revisited, the highest-value targets are the TCU-27 early-return ordering and the TCU-09 effect-local grace window. |

No functional gap. Nothing blocks merge.

# Terminal Unicode Width Fix — Validation (iteration 3)

## Validation

**Result**: ✅ PASS (visual criteria carry impl-evidence + runtime probe; interactive UAT remains manual-pending user confirmation per the spec's declared manual-validation convention)

**Date**: 2026-09-10
**Spec**: `.specs/features/terminal-unicode-width/spec.md` (13 requirements, UNIC-01..13)
**Diff range**: `main..HEAD` = `f08908d` (docs(specs)) + `ada3a69` + `d196df5` + `f99c1fd` + `e247ca0` + `4efbfcd` (fix(terminal): grapheme clustering), branch `feature/terminal-unicode-width`, HEAD `4efbfcd`
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero — **iteration 3**, after iteration 2 PASS but user UAT revealed `➡️` (U+27A1 U+FE0F) still broke; the `4efbfcd` fix swaps `@xterm/addon-unicode11` for `@xterm/addon-unicode-graphemes@0.4.0`

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1   | ✅ Done | Dependency swapped: `@xterm/addon-unicode11` is **gone** from `package.json` and `package-lock.json` (grep: 0 hits); `@xterm/addon-unicode-graphemes@^0.4.0` declared (`package.json:31`, `package-lock.json:18,2868`); `node_modules/@xterm/addon-unicode11` absent, `node_modules/@xterm/addon-unicode-graphemes` present |
| T2   | ✅ Done | `UnicodeGraphemesAddon` imported (`TerminalPane.tsx:3`), loaded (`:99`), `allowProposedApi: true` retained (`:87`); the addon self-activates `'15-graphemes'` (no manual `activeVersion` line) |
| T3   | ✅ Done | Spec updated to 13 ACs (UNIC-01..13) and the iteration-2 assumption documented (`spec.md:54-56`) |

No `tasks.md` for this feature (spec-only); no unit tests added (renderer component — repo convention TESTING.md; validation declared manual). No test imports `TerminalPane` (grep of `*.test.*` in `src`: 0 hits), so the automated suite cannot exercise this path.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + evidence | Result |
| ------------------------- | -------------------- | ---------------------- | ------ |
| UNIC-01: wide char SHALL occupy exactly two cells, following text aligned | Unicode 15 + grapheme width rules active | impl `TerminalPane.tsx:87` (`allowProposedApi: true`), `:99` (`loadAddon(new UnicodeGraphemesAddon())`); **probe A**: `❓`=x0/w2, `🤖`=x4/w2, `👍`=x6/w2, `👎`=x8/w2, then `f i m a` at x11-14 (w1) — grid aligned | ✅ PASS (runtime probe; visual render manual-pending UAT) |
| UNIC-02: emoji-presentation sequence (base + U+FE0F) SHALL be two cells, SHALL NOT consume the following cell | `➡️` width 2, following space intact | **probe A**: `➡️`=x2/**w2**, space=x10/w1 (would be x9 if width 1); **probe B** (`➡️ Sim`): `➡️`=x0/**w2**, space=x2/w1, `S`=x3 — the exact iteration-2 regression is closed | ✅ PASS (runtime probe) |
| UNIC-03: grapheme cluster (ZWJ/regional) SHALL be one grapheme's width, following text aligned | family ZWJ = 2 cells | **probe C** (`👨‍👩‍👧x`): cluster=x0/**w2** (chars `👨‍👩‍👧`), `x`=x2/w1 | ✅ PASS (runtime probe) |
| UNIC-04: combining mark / zero-width SHALL not advance cursor or displace neighbours | combining mark folds into base cell | **probe D** (`e`+U+0301+`x`): cell x0 chars `é`/w1, `x`=x1/w1, `cursorX=2`; VS16 zero-width folded (probe A/B) | ✅ PASS (runtime probe) |
| UNIC-05: selecting wide-char output SHALL NOT change on-screen text | correct measurement is the mechanism | impl `TerminalPane.tsx:87,99`; correct widths (probe A/B/C/D) mean no re-measure shift on selection | ✅ impl-evidence + probe; visual **manual-pending user UAT** |
| UNIC-06: WHILE rendered, active Unicode version SHALL be the grapheme provider's version | `term.unicode.activeVersion === '15-graphemes'` | **probe (state)**: `new Terminal({allowProposedApi:true})` + `loadAddon(new UnicodeGraphemesAddon())` → `activeVersion === "15-graphemes"` (self-activated) | ✅ PASS (runtime probe) |
| UNIC-07: TUI gutter first two columns SHALL keep intended content, no stale residue | visual (live session) | impl `TerminalPane.tsx:87,99` — terminal opens and measures wide glyphs at 2 cells (probe); no crash path | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-08: TUI vertical borders SHALL be one continuous column, no ghosts | visual (live session) | same impl; provider active (probe UNIC-06) | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-09: TUI redraw SHALL repaint cleanly (spinner/scroll/selection) | visual (live session) | same impl; stable widths (probe A/B) → repaint measures identically | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-10: wide char at last column SHALL wrap/clip per xterm rules, no bleed | wrap with no residue on the next line | **probe E** (`aaaaaaaaa`+`🤖`+`Z`, cols=10): row0 = 9×`a` (x0-8, no cell x9); `🤖`=row1/x0/w2, `Z`=row1/x2/w1 | ✅ PASS (runtime probe) |
| UNIC-11: mixed wide/narrow/clustered SHALL align cell-by-cell | cumulative x matches provider widths | **probe A** (mixed emoji + space + `fima`) and **probe C** (cluster + narrow): every cell x equals the cumulative provider widths | ✅ PASS (runtime probe) |
| UNIC-12: IF active version cannot be set THEN keep default, SHALL NOT crash | graceful default, no crash | **probe control**: `new Terminal({allowProposedApi:true})` with no addon → `activeVersion === "6"`, no throw; addon is statically bundled so the missing-provider branch cannot occur at runtime | ✅ PASS (runtime probe + impl) |
| UNIC-13: session switch SHALL re-activate the same provider | per-mount activation | both lines sit inside `useEffect(..., [sessionId])` body (`TerminalPane.tsx:71-99`, dep `:193`) → re-run on every pane mount/remount | ✅ PASS (impl evidence) |

**Status**: ✅ **13/13 addressed — 0 blocked.** 8 automatable PASS via runtime probe (UNIC-01/02/03/04/06/10/11/12); UNIC-13 impl-evidence; the visual criteria (UNIC-05/07/08/09) carry impl-evidence + probe and remain **manual-pending user UAT** per the spec's declared manual-validation convention — they are not a failure.

---

## Runtime Probe (decisive)

CJS script against the installed bundles (`node_modules/@xterm/xterm` v6.0.0 + `node_modules/@xterm/addon-unicode-graphemes` v0.4.0), `new Terminal({ allowProposedApi: true, cols: 40 })` + `loadAddon(new UnicodeGraphemesAddon())`, inspecting `buffer.active.getLine(0).getCell(x).getWidth()/getChars()`:

| # | Input | Observed (cell index / chars / width) | Expected | Verdict |
| - | ----- | ------------------------------------- | -------- | ------- |
| A | `❓➡️🤖👍👎 fima` | x0 `❓`/2, x2 `➡️`/**2**, x4 `🤖`/2, x6 `👍`/2, x8 `👎`/2, x10 ` `/1, x11-14 `fima`/1 | all emoji 2, space intact at x10, `f` at x11 | ✅ |
| B | `➡️ Sim` | x0 `➡️`/**2**, x2 ` `/1, x3 `S`/1, x4 `i`/1, x5 `m`/1 | `➡️`=2, space at x2 | ✅ |
| C | `👨‍👩‍👧x` | x0 `👨‍👩‍👧`/**2**, x2 `x`/1 | cluster 2, `x` at x2 | ✅ |
| D | `e`+U+0301+`x` | x0 `é`/1, x1 `x`/1, `cursorX=2` | combining mark folds, no cursor advance | ✅ |
| E | 9×`a`+`🤖`+`Z` (cols=10) | row0 x0-8 = `a`×9 (x9 empty); row1 x0 `🤖`/2, x2 `Z`/1 | wide wraps, no bleed | ✅ |
| state | after `loadAddon` | `term.unicode.activeVersion === "15-graphemes"` | `'15-graphemes'` | ✅ |
| neg-control | `new Terminal({})` → `loadAddon` | **THREW** `You must set the allowProposedApi option to true to use proposed API` | throw (gate real) | ✅ |
| no-addon | `new Terminal({allowProposedApi:true})`, no addon | `activeVersion === "6"` (default) | default kept, no crash | ✅ |

**Iteration-2 root cause re-proven (M1 probe)**: with the genuine `@xterm/addon-unicode11@0.9.0` active (`activeVersion='11'`) AND with no addon (default Unicode 6), `➡️` measures **width 1** and the following space lands at **x1** (eaten) — the user-visible reflow. The graphemes addon is the only setup that yields width 2 (probe B).

---

## Discrimination Sensor

Scratch: `D:\worktrees\unicode-verifier3` (detached HEAD `4efbfcd`, `node_modules` junction) — removed after; real tree untouched (`git status --porcelain` identical to baseline, no `git stash`).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `TerminalPane.tsx:3` + `:99` | Removed the addon entirely (import + `loadAddon`) | **Survives the gate** (typecheck exit 0, lint 0 errors; no test imports `TerminalPane`) → **killed by probe, not by gate**: no-addon probe (M1b) reads default `"6"` and `➡️`=**w1** with the space at x1 (the bug). The behavioral variant (genuine Unicode 11 addon + `activeVersion='11'`) reproduces the same width 1 |
| M2 | `TerminalPane.tsx:87` | Removed `allowProposedApi: true` | **Survives the full gate** (typecheck 0, lint 0 errors, **667 tests passed**) → **killed by probe, not by gate**: negative control throws `You must set the allowProposedApi...` and the terminal never opens |
| M3 | `TerminalPane.tsx:99` | Removed only `term.loadAddon(new UnicodeGraphemesAddon())`, kept the import | ✅ **Killed by gate**: typecheck `TS6133 'UnicodeGraphemesAddon' is declared but its value is never read` (exit 2); also killed by probe (`activeVersion` stays `"6"` ≠ `"15-graphemes"`) |

**Sensor depth**: lightweight (3 behavior-level mutations, per default tier) + runtime API probe.
**Result**: 1/3 killed by gate (M3); M1 and M2 survive the gate and are **documented as "morto por probe, não por gate"** — the gate is green because the renderer terminal path has no unit test (TESTING.md convention; grep confirms no `*.test.*` imports `TerminalPane`), so only the behavior-level probe discriminates. All three mutations break the feature's behavior, so the sensor is effective. The source-level swap to `Unicode11Addon` is not representable as a clean compiling edit precisely because the dependency was removed by the fix; the probe mutation covers it faithfully.

---

## Interactive UAT Results

Not performed in this iteration — **pending user UAT** (the spec declares validation manual). The iteration-2 regression was reported by the user after live use, so this round must be re-confirmed live. Suggested script (spec Independent Test): print `? ➡️ 🤖 👍 👎 fima` in a live agent session (space before `fima` intact, selection does not reflow, no edge residue) and run a Claude Code session to watch the gutter/borders through spinner ticks, scrolls and selections.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ one import line + one `loadAddon` line (`TerminalPane.tsx:3,99`); `allowProposedApi` retained; no new abstractions |
| Surgical changes | ✅ `4efbfcd` swaps the dependency + addon only; `package.json`/`package-lock.json` reflect the removal/addition; no unrelated edits |
| No scope creep | ✅ xterm upgrade and font change stay Out of Scope; the single new dep replaces the old one (net zero extra) |
| Matches patterns | ✅ addon usage mirrors the existing `FitAddon` `loadAddon` pattern; inline in the single terminal surface |
| Spec-anchored outcome check | ✅ the probe's exact widths (`➡️`=2, `❓/🤖/👍/👎`=2, family=2, combining=1, wide-wrap) match the spec's stated outcomes and the Assumptions table (`spec.md:54-56`) |
| Every test maps to a spec requirement | ✅ no feature tests added/removed (renderer component, per TESTING.md); 667 existing tests unchanged |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, spec assumption updated, comments reference UNIC-01..13 |

---

## Edge Cases

- [x] UNIC-10 (wide char at viewport margin): probe E — `🤖` wraps to the next row, no residue on the row above
- [x] UNIC-11 (mixed width, cumulative alignment): probe A/C — every cell x matches the provider's cumulative widths
- [x] UNIC-12 (addon missing → keep default, no crash): probe no-addon reads `"6"` and does not throw; static bundling makes the branch structurally unreachable
- [x] UNIC-13 (session switch re-activates): per-mount `useEffect` re-runs the `loadAddon` line (`TerminalPane.tsx:99`, dep `:193`)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **typecheck**: PASS (node + web, exit 0, no diagnostics)
- **lint**: PASS — 0 errors, **19 pre-existing `prettier/prettier` warnings** (all in `scripts/`, `*.test.ts`, non-feature files), exit 0
- **test**: **667 passed, 0 failed, 0 skipped** (44 test files, vitest run)
- **Skipped**: none; **Failures**: none
- **Test integrity**: no tests added or removed by this feature (no unit per convention); the green gate does not exercise the renderer terminal path — which is exactly why sensor mutations M1/M2 survive the gate and only the runtime probe discriminates them

---

## Fix Plans (if issues found)

None blocking. The iteration-2 open defect (`➡️` U+27A1 U+FE0F measured as 1 cell, space eaten) is verified closed by `4efbfcd` + probe B/A. The unrelated `@electron/windows-sign` lockfile churn noted in iteration 1 is unchanged — still harmless and out of feature scope.

---

## Requirement Traceability Update

| Requirement | Iteration 2 Status | New Status |
| ----------- | ------------------ | ---------- |
| UNIC-01 | ✅ impl-evidence; manual-pending | ✅ Verified (runtime probe) |
| UNIC-02 | ✅ impl-evidence; manual-pending (regression later found in UAT) | ✅ Verified (runtime probe — `➡️`=2, space intact) |
| UNIC-03 | ✅ impl-evidence; manual-pending | ✅ Verified (runtime probe — ZWJ family=2) |
| UNIC-04 | ✅ impl-evidence; manual-pending | ✅ Verified (runtime probe — combining mark folds) |
| UNIC-05 | ✅ impl-evidence; manual-pending | ✅ impl-evidence + probe; **manual-pending** |
| UNIC-06 | ✅ Verified (`activeVersion='11'`) | ✅ Verified (`activeVersion='15-graphemes'`) |
| UNIC-07 | ✅ impl-evidence; manual-pending | ✅ impl-evidence; **manual-pending** |
| UNIC-08 | ✅ impl-evidence; manual-pending | ✅ impl-evidence; **manual-pending** |
| UNIC-09 | ✅ impl-evidence; manual-pending | ✅ impl-evidence; **manual-pending** |
| UNIC-10 | ✅ impl-evidence; manual-pending | ✅ Verified (runtime probe — wide wrap, no bleed) |
| UNIC-11 | ✅ impl-evidence; manual-pending | ✅ Verified (runtime probe — cell-by-cell alignment) |
| UNIC-12 | ✅ Verified (impl order + probe no-throw) | ✅ Verified (probe: default `"6"`, no crash) |
| UNIC-13 | ✅ Verified (impl evidence) | ✅ Verified (impl evidence, per-mount effect) |

---

## Summary

**Overall**: ✅ **PASS** (visual criteria carry impl-evidence + probe; interactive UAT remains manual-pending user confirmation — declared manual by the spec, not a failure)

**Spec-anchored check**: 13/13 addressed, **0 blocked** — 9 Verified (8 runtime-probe: UNIC-01/02/03/04/06/10/11/12; 1 impl-evidence: UNIC-13) + 4 impl-evidence criteria with **manual-pending** visual confirmation (UNIC-05/07/08/09).
**Iteration-2 defect closed (evidence)**: with the Unicode 11 addon (or default Unicode 6) `➡️` measured **1** cell and ate the following space; with `@xterm/addon-unicode-graphemes@0.4.0` it measures **2** and the space stays put (probe A/B). Dependency swap confirmed: `@xterm/addon-unicode11` absent from `package.json`/`package-lock.json`/`node_modules`; `@xterm/addon-unicode-graphemes` present and self-activating `'15-graphemes'`.
**Sensor**: 1/3 killed by gate (M3, TS6133); M1 and M2 survive the gate and are **killed by probe** — documented as "morto por probe, não por gate", the expected profile for a renderer terminal path with no unit tests.
**Gate**: typecheck PASS, lint PASS (0 errors, 19 pre-existing warnings), **667 passed / 0 failed / 0 skipped** — green, same baseline as iteration 2.
**Real tree**: clean — `git status --porcelain` identical to baseline after scratch removal (4 pre-existing untracked `.specs` folders; no `git stash`, scratch worktree removed).

**What works**: the addon swap delivers Unicode 15 widths **with grapheme clustering** — plain emojis, VS16 emoji-presentation sequences (`➡️`), ZWJ families, combining marks and wide-at-margin wrapping all measure per the provider; the proposed-API gate (`allowProposedApi`) is retained and probe-verified.

**Gaps**: **manual UAT pending** — the visual criteria (UNIC-05/07/08/09) need a user-run live session (print `? ➡️ 🤖 👍 👎 fima`; run a Claude Code session) to flip `manual-pending` → Verified. Minor: unrelated `@electron/windows-sign` lockfile churn (out of feature scope, unchanged since iteration 1).

**Next steps**: user-run UAT for the visual ACs (especially re-confirming `➡️` in a live session), then the feature is verifiably done.

# Scrollback Append Specification

## Problem Statement

Every running session keeps its terminal output in a bounded scrollback buffer in main
(`SessionRingBuffer`, about 1 MB / 5,000 lines), so a session switch can replay what the renderer
missed. Every PTY chunk of every session is appended to it, on screen or not. `append` splits the
whole buffer into lines for the line cap, measures the whole buffer's UTF-8 length for the byte cap,
and once over a cap joins the kept lines back and walks characters one by one. Each chunk therefore
costs time in proportion to the buffer, not the chunk: about 1.2-1.6 ms and 2-3 MB of garbage per
chunk once the buffer is full (in-memory bench of the same logic, issue #148). An agent's TUI
redraws tens of times a second, so a few working sessions keep main busy, which delays keystroke
echo, IPC replies and the replies to the agents' hook calls. Upstream issue #148 is the
owner-approved scope.

**Order of work.** This feature executes only after #147 (`perf-diagnostics`) is executed: it
measures with #147's bench and log, and its first task reads #147's recorded baseline and can stop
the work before any code changes.

## Goals

- [ ] Appending a chunk costs time in proportion to the chunk: the bench's mean append is under 0.1 ms per chunk with 6 sessions printing
- [ ] Main's event-loop p99 is under the loop target in force (30 ms unless #147's baseline recalibrated it) with 6 sessions printing
- [ ] `snapshot()` and `tail()` return exactly what they return today after every append, so a session switch replays exactly what it replays now

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Changing the caps or what a switch replays | Issue #148, Out of Scope |
| Batching the `session:data` forward to the renderer | Issue #148, Out of Scope |
| The renderer's terminal | Issue #148, Out of Scope: only the attached session renders |
| Correcting today's byte-cap quirks (a surrogate half counted as 3 bytes in the walk, a cut that splits a surrogate pair, a result left a few bytes over `maxBytes`) | The contract is today's output; a fix changes what a switch replays and is its own change (see Assumptions) |
| Any change to `TerminalModeTracker` or `session-manager.ts` | The tracker is reused as is; the caller does not change (issue #148, Implementation Decisions) |
| The other three suspects (git recount cascade #149, Files watcher #150, synchronous git #151) | Each has its own issue; they may still hold the event loop back (see Assumptions) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What the fix is | Appending a chunk costs time in proportion to the chunk; same caps, same oldest-first trimming, same mode tracking of trimmed content, same `snapshot()` and `tail()` output | Issue #148, Solution | owner confirmed 2026-10-01 |
| Targets | Under 0.1 ms per append with a full buffer, and main's event-loop p99 under 30 ms with 6 sessions printing, measured with #147's bench | Issue #148, Solution; #147 PDIAG-41 defines the append figure as the mean (`appendMs` over `chunks`, all sessions, steady rows) | owner confirmed 2026-10-01 |
| How the cost becomes proportional | Running counts of lines and UTF-8 bytes updated from each chunk; trims only past a cap, in amortised steps over a chunk list, so no step walks the whole buffer per append | Issue #148, Implementation Decisions | owner confirmed 2026-10-01 |
| Trimmed content and modes | The trimmed head still goes through the terminal mode tracker before it is dropped | Issue #148, Implementation Decisions | owner confirmed 2026-10-01 |
| `tail(n)` | Reads from the end of the buffer without splitting all of it | Issue #148, Implementation Decisions | owner confirmed 2026-10-01 |
| Public API | `append`, `snapshot`, `tail` and the two caps unchanged; the session manager does not change | Issue #148, Implementation Decisions | owner confirmed 2026-10-01 |
| The contract | The existing unit tests pass unchanged; new tests compare the new buffer with today's algorithm on random chunk sequences and require the same `snapshot()` and `tail()` after every append | Issue #148, Testing Decisions | owner confirmed 2026-10-01 |
| Cost in unit tests | No unit test asserts a duration; the per-chunk figure comes from the bench and goes in the validation notes | Issue #148, Testing Decisions (flaky on CI) | owner confirmed 2026-10-01 |
| Dependency and stop rule | Executes after #147; the first task reads #147's `## Baseline` and stops, reporting to the owner, if the 6-session baseline already shows the append under 0.1 ms or the event loop under its target | Issue #148, Further Notes; instruction for this plan | owner confirmed 2026-10-01 |
| Exactness of the equivalence | Exact: the same characters from `snapshot()` and `tail(n)` as today's algorithm after every append, which means the same cut points, including today's quirks (each half of a surrogate pair counts 3 bytes in the walk; a cut with no newline after the stop point lands mid-line and can split a surrogate pair; the result can stay up to a few bytes over `maxBytes`). Measured on today's code: `maxBytes: 6`, one chunk `xx😀😀` leaves `\ude00😀`, 7 bytes | "Same output as today" (issue #148); exactness does not force an O(n) step, so nothing is relaxed | owner confirmed 2026-10-01 |
| Fixing those quirks | Not here; a follow-up issue if the owner wants the caps exact | They are invisible in a terminal (a lone surrogate renders as one replacement cell at the head of the replay) and fixing them changes the replay | pending owner |
| Where today's algorithm lives for the tests | A verbatim copy of today's class, `ReferenceSessionRingBuffer`, in `src/main/session-ring-buffer-reference.fixture.ts`, using the real `TerminalModeTracker`; imported only by tests; never edited | The repo's `*.fixture.ts` precedent (`activity-sequences.fixture.ts`); a separate file keeps the existing test file unchanged and the copy out of the bundle | pending owner |
| Two test seams | `SessionRingBufferOptions` gains an optional `pieceUnits` (default 16,384) and the class a read-only `pieceCount`; the session manager uses neither | Without `pieceUnits` the random sequences, at the small caps that make them trim often, never reach a second piece, so the multi-piece paths would go untested; without `pieceCount` a buffer that stores one piece per chunk (memory per keystroke echo) passes every output test | pending owner |
| Piece size | A chunk joins the last piece while that piece holds fewer than 16,384 code units, or when it completes a surrogate pair the last piece ends with; otherwise it starts a new piece | At the default caps that is at most about 64 pieces; a piece is long enough that per-piece bookkeeping is noise and short enough that re-reading one is cheap | pending owner |
| `tail(n)` arguments | The contract covers integer `n`; the only caller passes 2 | Today `tail(0.5)` returns the whole buffer through `Array.prototype.slice` rounding; nothing calls it that way | pending owner |
| Caps below one line | `maxLines` below 1 is outside the contract; the constructor does not validate | Today `maxLines: 0` keeps everything and feeds it all to the mode tracker on every append; no caller passes it, and validating would change the API | pending owner |
| Random sequences | Seeded PRNG in the test file (no new dependency), 200 sequences of 300 appends at caps drawn from `maxBytes` 1-512 and `maxLines` 1-40, `pieceUnits` drawn from 1, 2, 3, 7, 64 and 16,384; plus one sequence of 600 TUI-like frames at the default caps | Small caps make trims happen on most appends; the default-cap sequence exercises the real sizes | pending owner |
| Before and after | In one sitting on one machine: `--sessions 6` at default settings on today's `session-ring-buffer.ts` swapped back in by a script, then on the branch; #147's baseline is quoted beside them | A same-sitting pair removes machine drift; swapping one file isolates this change | pending owner |
| The loop target fails while the append target passes | Stop and report to the owner with both summaries before the PR | The other suspects (#149-#151) may hold the loop back; the owner decides whether this PR ships on the append figure | pending owner |
| `appendMaxMs` | Reported beside the mean, not judged | #147 judges the mean; an amortised trim has occasional longer appends by design | pending owner |

**Open questions:** none unmarked. Rows marked "pending owner" carry the recommended default the plan is
built on.

---

## Implicit-Requirement Sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | Caps as today; empty chunk is a no-op (SBAP-12); chunks larger than `maxBytes` (SBAP-28); `maxLines` below 1 and non-integer `tail(n)` outside the contract (Assumptions) |
| Failure / partial-failure states | N/A because the buffer does string work only: no I/O, nothing to fail part way |
| Idempotency / retry / duplicates | N/A because `append` is not meant to be idempotent; determinism is covered by equivalence (SBAP-07, SBAP-16) |
| Auth boundaries & rate limits | N/A because the buffer is internal to main |
| Concurrency / ordering | Main is single-threaded and every method is synchronous; dropped content reaches the mode tracker before `append` returns (SBAP-14) |
| Data lifecycle / expiry | Retention bounded by the caps as today; stored pieces bounded (SBAP-03) |
| Observability | #147's `measureAppend` already times every append per session; no new counter (SBAP-26) |
| External-dependency failure | N/A because there is no external dependency |
| State-transition integrity | The mode tracker's state is a function of the dropped text in order, as today (SBAP-14, SBAP-31) |

---

## User Stories

### P1: Appending costs the chunk, not the buffer ⭐ MVP

**User Story**: As a developer with several agents working, I want my typing to echo at once and the
agents' hook calls answered without delay, so that the app stays live as I open more sessions.

**Why P1**: It is the fix the issue asks for (user stories 1 and 2 of #148).

**Acceptance Criteria**:

1. The `append` method SHALL do work proportional to the chunk plus the content it drops, and SHALL NOT split, join, copy or measure the whole retained content <!-- ubiquitous -->
2. The buffer SHALL keep the retained content's newline count and UTF-8 byte count as running totals, updated from each appended chunk and each dropped range, so that neither cap check reads retained content <!-- ubiquitous -->
3. WHEN 50,000 one-character chunks are appended at the default caps THEN the buffer SHALL hold at most 4 pieces, and WHEN 2,000,000 characters arrive in 4,096-character ASCII chunks without newlines at the default caps THEN it SHALL hold at most 64 pieces <!-- event-driven -->
4. WHEN `node scripts/bench-sessions.mjs --sessions 6` runs at default settings on this branch THEN its `append mean < 0.1 ms per chunk` target line SHALL read PASS <!-- event-driven -->
5. WHEN the same run completes THEN its `loop p99` target line, judged against the loop target in force in #147's `## Baseline`, SHALL read PASS <!-- event-driven -->
6. The constructor options `maxBytes` and `maxLines` with defaults 1,000,000 and 5,000, `append(chunk)`, `snapshot()`, `tail(lines)` and the read-only `maxBytes` and `maxLines` SHALL keep their signatures and meaning, and `src/main/session-manager.ts` SHALL have no diff <!-- ubiquitous -->

**Independent Test**: The bench's summary with 6 sessions reads PASS on both target lines, against a
same-sitting run of today's algorithm that reads FAIL on the append line.

---

### P1: A session switch replays exactly what it replays today ⭐ MVP

**User Story**: As a developer switching sessions, I want the replay to show the same scrollback as
today, so that nothing is lost.

**Why P1**: User story 3 of #148; the rewrite is acceptable only if the output is unchanged.

**Acceptance Criteria**:

7. After every append, `snapshot()` SHALL return, character for character, what `ReferenceSessionRingBuffer.snapshot()` returns for the same caps and the same chunk sequence <!-- ubiquitous -->
8. WHEN the retained content holds `maxLines` newlines or more THEN the buffer SHALL drop the oldest content through the newline that leaves exactly `maxLines - 1` newlines retained <!-- event-driven -->
9. WHEN the retained content's UTF-8 length (a surrogate pair counts 4 bytes, a lone surrogate 3) exceeds `maxBytes` by E bytes THEN the buffer SHALL find the stop point by adding, from the oldest code unit, each code unit's own UTF-8 length (1, 2 or 3, where each half of a surrogate pair counts 3) until the sum reaches E or the content ends <!-- event-driven -->
10. WHEN the stop point is found THEN the buffer SHALL cut just after the first newline at or after the stop point, or at the stop point itself when no newline follows it <!-- event-driven -->
11. The buffer SHALL apply the line cap first and then the byte cap, on the content the line cap left, within each append <!-- ubiquitous -->
12. WHEN `append('')` is called THEN the buffer SHALL leave its content, its counts and the mode tracker unchanged <!-- event-driven -->

**Independent Test**: The named cases below give their literal outputs on today's code and on the new
buffer, and the random sequences find no difference.

---

### P1: Terminal modes are still restored after a switch ⭐ MVP

**User Story**: As a developer whose agent runs a TUI, I want the alternate screen, mouse and paste
modes still restored on a switch, so that the session behaves after switching.

**Why P1**: User story 4 of #148.

**Acceptance Criteria**:

13. WHEN content is dropped by either cap THEN the buffer SHALL feed it to its `TerminalModeTracker` before `append` returns <!-- event-driven -->
14. The text fed to the mode tracker over a buffer's life SHALL be exactly the dropped text, in the order it was dropped, each character once <!-- ubiquitous -->
15. The `snapshot()` method SHALL return the mode tracker's `prefix()` followed by the retained content <!-- ubiquitous -->

**Independent Test**: `snapshot()` equals the reference's on sequences whose mode sequences are split
across cuts; the existing TSP-06/TSP-07 tests pass unchanged.

---

### P1: The session's last-output preview is unchanged ⭐ MVP

**User Story**: As a developer, I want a session's last-output preview unchanged, so that the session
list still carries what each session last printed.

**Why P1**: User story 5 of #148. AD-018 removed the preview from the rail, but `SessionView.lastOutput`
still carries `tail(2)` (AGCF-08 ACs 1, 3, 4) and every `sessions:list` reads it.

**Acceptance Criteria**:

16. After every append, `tail(n)` SHALL return what `ReferenceSessionRingBuffer.tail(n)` returns for n = 0, 1, 2, 3 and `maxLines + 1` <!-- ubiquitous -->
17. The `tail(n)` method SHALL read from the end of the retained content, doing work proportional to its result plus at most one piece, and SHALL NOT split the whole retained content <!-- ubiquitous -->

**Independent Test**: `tail(3)` and `tail(5)` after `a\nb\nc\nd` at `maxLines: 3` both give `b\nc\nd`,
on today's code and on the new buffer.

---

### P1: The tests are the contract ⭐ MVP

**User Story**: As the developer making the change, I want today's behaviour pinned before I touch it,
so that the rewrite cannot change it unseen.

**Why P1**: Issue #148, Testing Decisions.

**Acceptance Criteria**:

18. The files `src/main/session-ring-buffer.test.ts` and `src/main/terminal-mode-tracker.test.ts` SHALL have no diff, and SHALL pass <!-- ubiquitous -->
19. The file `src/main/session-ring-buffer-reference.fixture.ts` SHALL hold `ReferenceSessionRingBuffer`, a verbatim copy of today's `SessionRingBuffer` body using the real `TerminalModeTracker`, and SHALL be imported by test files only <!-- ubiquitous -->
20. The equivalence test SHALL assert the literal outputs of the named-case table on both `SessionRingBuffer` and `ReferenceSessionRingBuffer` <!-- ubiquitous -->
21. The equivalence test SHALL replay 200 seeded random sequences of 300 appends each, with chunks cut at random code-unit offsets from a stream of ASCII words, `\n`, `\r\n`, lone `\r`, 2-, 3- and 4-byte characters, DEC private mode sequences and other CSI sequences, lines longer than `maxBytes`, and empty chunks, and SHALL compare `snapshot()` and `tail(n)` (SBAP-16's values of n) with the reference after every append <!-- ubiquitous -->
22. IF a random sequence differs from the reference THEN the failure message SHALL name the seed, the append index, the caps, `pieceUnits` and the chunk <!-- unwanted-behavior -->
23. WHEN today's algorithm is mutated to walk by code point, to cut at the stop point without looking for a newline, or to feed the mode tracker on the line cap only THEN the random sequences SHALL fail for each mutant <!-- event-driven -->
24. The equivalence test SHALL pin `maxBytes` 1,000,000, `maxLines` 5,000 and `pieceUnits` 16,384 as the defaults with literal values, and SHALL assert no duration <!-- ubiquitous -->

**Independent Test**: The equivalence file passes on today's code before the rewrite (the subject is
the reference itself) and fails on each of the three mutants.

---

### P1: Measured against #147's baseline ⭐ MVP

**User Story**: As the owner, I want the fix measured before and after on the bench #147 built, so
that the target is shown met and the work stops if the baseline says it is not needed.

**Why P1**: Issue #148, Solution and Further Notes.

**Acceptance Criteria**:

25. IF #147's `## Baseline` shows, for the `--sessions 6` run, a mean append under 0.1 ms or a `loop.p99Ms` under the loop target in every steady row THEN the first task SHALL stop and report to the owner before any code changes <!-- unwanted-behavior -->
26. The file `.specs/features/scrollback-append/validation.md` SHALL hold a `## Bench` section with two `--sessions 6` summaries from one sitting, today's `session-ring-buffer.ts` and this branch's, each verbatim with its commit, plus the `--sessions 6` figures quoted from #147's baseline <!-- ubiquitous -->
27. IF the branch's run reads FAIL on either target line THEN the measuring task SHALL stop and report both summaries to the owner before the PR <!-- unwanted-behavior -->

**Independent Test**: `## Bench` holds both summaries, the commits, and a written verdict.

---

## Edge Cases

Each case is a named case in the equivalence test, with the literal output measured on today's code
(2026-10-01). Caps are `maxBytes / maxLines`; chunks are JSON strings.

| ID | Case | Caps | Chunks | `snapshot()` | Notes |
| -- | ---- | ---- | ------ | ------------ | ----- |
| SBAP-28 | A chunk over the cap with no newline keeps its last bytes, cut mid-line | 10 / 100 | `"0123456789"`, `"a"` | `"123456789a"` | Exactly 10 bytes after the first chunk is kept whole |
| SBAP-29 | A surrogate pair split across two chunks counts 4 bytes, not 6 | 5 / 100 | `"a\ud83d"`, `"\ude00"` | `"a😀"` | 5 bytes, nothing dropped |
| SBAP-30 | The walk counts each surrogate half as 3; the cut splits the pair and the result stays over the cap | 6 / 100 | `"xx😀😀"` | `"\ude00😀"` | 7 bytes; `tail(2)` is the same |
| SBAP-31 | A mode sequence split across chunks and dropped by the cut is still applied | 6 / 100 | `"\u001b[?10"`, `"49h\nab\ncd"` | `"\u001b[?1049hab\ncd"` | The prefix comes from the tracker |
| SBAP-32 | `tail` never returns dropped lines | 1000 / 3 | `"a\nb\nc\nd"` | `"b\nc\nd"` | `tail(3)` and `tail(5)` are `"b\nc\nd"` |
| SBAP-33 | Only `\n` ends a line; `\r` is content | 1000 / 2 | `"a\r\nb\r\nc\r\n"` | `"c\r\n"` | |
| SBAP-34 | A cut can empty the buffer; the next append starts it again | 3 / 100 | `"abcd\n"`, `"xy"` | `""` after the first, `"xy"` after the second | |
| SBAP-35 | Exactly `maxLines - 1` newlines are kept; `maxLines` newlines drop the oldest line | 1000 / 3 | `"a\nb\nc"`; then a fresh buffer with `"a\nb\nc\n"` | `"a\nb\nc"`; `"b\nc\n"` | `tail(2)` of the second is `"c\n"` (L-028 boundary) |
| SBAP-36 | One append applies the line cap, then the byte cap | 6 / 3 | `"aa\nbb\ncc\ndd"` | `"cc\ndd"` | Lines leave `bb\ncc\ndd` (8 bytes); bytes cut after the next newline |
| SBAP-37 | The byte cut goes past the stop point to the next newline | 8 / 100 | `"abcdefghijkl\nxy"` | `"xy"` | Also `7 / 100`, `"ééé\néé"` gives `"éé"` |
| SBAP-38 | A buffer ending in a newline | 1000 / 100 | `"x\ny\n"` | `"x\ny\n"` | `tail(1)` is `""`, `tail(2)` is `"y\n"` |
| SBAP-39 | Modes set and reset inside the dropped head leave no prefix | 1000 / 2 | `"\u001b[?2004h\n"`, `"l1\n"`, `"\u001b[?2004l\n"`, `"l2\n"` | `"l2\n"` | |
| SBAP-40 | An empty chunk changes nothing | 5 / 100 | `"abc"`, `""`, `"de"` | `"abcde"` | |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SBAP-01 | P1: append cost — AC 1 | T4 | Pending |
| SBAP-02 | P1: append cost — AC 2 | T4 | Pending |
| SBAP-03 | P1: append cost — AC 3 | T4 | Pending |
| SBAP-04 | P1: append cost — AC 4 | T6 | Pending |
| SBAP-05 | P1: append cost — AC 5 | T6 | Pending |
| SBAP-06 | P1: append cost — AC 6 | T4, T5 | Pending |
| SBAP-07 | P1: same replay — AC 7 | T3, T4 | Pending |
| SBAP-08 | P1: same replay — AC 8 | T2, T4 | Pending |
| SBAP-09 | P1: same replay — AC 9 | T2, T4 | Pending |
| SBAP-10 | P1: same replay — AC 10 | T2, T4 | Pending |
| SBAP-11 | P1: same replay — AC 11 | T2, T4 | Pending |
| SBAP-12 | P1: same replay — AC 12 | T2, T4 | Pending |
| SBAP-13 | P1: modes — AC 13 | T2, T4 | Pending |
| SBAP-14 | P1: modes — AC 14 | T3, T4 | Pending |
| SBAP-15 | P1: modes — AC 15 | T2, T4 | Pending |
| SBAP-16 | P1: preview — AC 16 | T3, T5 | Pending |
| SBAP-17 | P1: preview — AC 17 | T5 | Pending |
| SBAP-18 | P1: contract — AC 18 | T2, T4, T5 | Pending |
| SBAP-19 | P1: contract — AC 19 | T2 | Pending |
| SBAP-20 | P1: contract — AC 20 | T2 | Pending |
| SBAP-21 | P1: contract — AC 21 | T3, T4 | Pending |
| SBAP-22 | P1: contract — AC 22 | T3, T4 | Pending |
| SBAP-23 | P1: contract — AC 23 | T3 | Pending |
| SBAP-24 | P1: contract — AC 24 | T2, T4 | Pending |
| SBAP-25 | P1: measured — AC 25 | T1 | Pending |
| SBAP-26 | P1: measured — AC 26 | T6 | Pending |
| SBAP-27 | P1: measured — AC 27 | T6 | Pending |
| SBAP-28 | Edge: chunk over the cap, no newline | T2 | Pending |
| SBAP-29 | Edge: pair split across chunks | T2 | Pending |
| SBAP-30 | Edge: cut splits a pair, stays over the cap | T2 | Pending |
| SBAP-31 | Edge: mode sequence split across the cut | T2 | Pending |
| SBAP-32 | Edge: tail never returns dropped lines | T2 | Pending |
| SBAP-33 | Edge: `\r` is content | T2 | Pending |
| SBAP-34 | Edge: a cut empties the buffer | T2 | Pending |
| SBAP-35 | Edge: line-cap boundary | T2 | Pending |
| SBAP-36 | Edge: line cap then byte cap | T2 | Pending |
| SBAP-37 | Edge: byte cut past the stop point | T2 | Pending |
| SBAP-38 | Edge: trailing newline | T2 | Pending |
| SBAP-39 | Edge: modes reset inside the dropped head | T2 | Pending |
| SBAP-40 | Edge: empty chunk | T2 | Pending |

**Coverage:** 40 total, 40 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] The bench with 6 sessions reads PASS on the append and loop target lines, and today's algorithm in the same sitting reads FAIL on the append line
- [ ] 200 random sequences of 300 appends and every named case give the same `snapshot()` and `tail(n)` as today's algorithm, and the same random sequences fail on each of three mutants of it
- [ ] `session-manager.ts`, `session-ring-buffer.test.ts` and `terminal-mode-tracker.test.ts` have no diff

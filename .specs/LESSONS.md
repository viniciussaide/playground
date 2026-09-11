# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-001 - When a design types a cross-phase dependency as required, wire the producer and consumer in one phase (or gate the field) rather than relaxing it to optional to keep an interim phase's typecheck green
- signal: `spec_deviation` · recurrence: 2 feature(s) · scope: `workflow-ctx` · harmful: 0
- features: workflows-agent-step, workflows-blocker-resume
- evidence: src/main/workflow-ctx.ts:82,106 (CtxDeps.agent / CtxRuntime.signal SPEC_DEVIATION) (workflow-ctx) (+1 more)
- last seen: 2026-07-06T16:15:40Z

### L-005 - Before adding real-process or real-git tests, check whether existing suites already sit near the default per-test timeout: the extra parallel load alone can push them over it, turning a green gate red without any production change
- signal: `gate_fail` · recurrence: 2 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook, worktree-removal-fault-tolerance
- evidence: validation.md round-2 gate section; tree.test.ts / worktree-manager.test.ts timeouts (testing) (+1 more)
- last seen: 2026-07-31T12:27:40Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-003 - When wrapping a spawned process with a timeout, settle the promise on 'exit' plus a short flush grace period, never on 'close' alone: 'close' waits for stdio EOF and killing a shell does not kill its children, so a surviving grandchild holds the inherited pipes and the promise can lag by seconds or never settle
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `child-process` · harmful: 0
- features: worktree-post-create-hook
- evidence: validation.md round-1 blocker; src/main/hook-shell.ts:71 (child-process)
- last seen: 2026-07-29T22:37:03Z

### L-004 - Assert a spec-defined bound against its literal value, not against the constant that implements it: expect(x).toHaveLength(MAX_CHARS) is self-referential and survives a mutation of MAX_CHARS itself
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook
- evidence: mutant R1/M7; post-create-hook.test.ts output-tail test (testing)
- last seen: 2026-07-29T22:37:04Z

### L-006 - Assert a returned payload field by its value, not by the value you handed an injected fake: a field that appears in the test only as a spy's input reads like coverage in review, but a mutation dropping it from the real return still passes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-removal-fault-tolerance
- evidence: round-1 mutant M6; worktree-manager.test.ts leftover: at :844/:867/:882 were spyDeleter inputs, not assertions - dropping the field from worktree-manager.ts:335-339 left all 80 tests green; closed by F1 124340c (testing)
- last seen: 2026-07-31T12:27:40Z

### L-007 - When writing a test to kill a specific surviving mutant, check the fixture does not encode that mutant's own blind spot: pick one whose readings differ under every wrong implementation, not just the one you saw. A directories-only residue pinned the recursive count yet let a directories-only count survive
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-removal-fault-tolerance
- evidence: round-2 mutant N3 survived the round-1 fix F2 (dir-remover.test.ts:328-348 fixture wt/keep/a/b was directories-only); closed by F3 1abe8aa with a mixed chain giving 3/2/1/1 for every-entry/dirs-only/files-only/top-level (testing)
- last seen: 2026-07-31T12:27:40Z

### L-008 - When a hard-coded value becomes a lookup table keyed by an existing enum, test the wiring from key to entry, not just the table: asserting the table's contents leaves the new key free to silently resolve to the old entry, and a guard that returns before any side effect (a missing-path check) usually makes that routing assertable without touching the real subsystem.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: vs2026-admin-shortcut
- evidence: M4/M5: launch() -> VS_EDITIONS[tool]; openVisualStudio(edition) (src/main/**)
- last seen: 2026-08-28T19:48:01Z

### L-009 - A default-constant test that asserts resolvePaneWidth(undefined, bounds, DEFAULT) against DEFAULT itself cannot detect a change to that constant — pin every spec-derived default with a literal assertion, not a self-referential one.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer/lib` · harmful: 0
- features: sidebar-resize-collapse
- evidence: src/renderer/src/lib/pane-layout.test.ts:41 (renderer/lib)
- last seen: 2026-08-31T22:35:36Z

### L-010 - When a spec edge case says 'empty/whitespace', guard with trim().length > 0, not length > 0, or whitespace-only selections slip past the empty check.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `src/renderer/src/components` · harmful: 0
- features: terminal-input-fixes
- evidence: src/renderer/src/components/TerminalPane.tsx:95 (src/renderer/src/components)
- last seen: 2026-09-01T00:11:37Z

### L-011 - When an AC names a literal byte or string the app must emit, export that literal as a const from the tested lib seam and assert it (plus assert it is NOT the wrong value) - a literal inlined in an untested component leaves a NOT-SHALL-send AC unguarded and a byte flip passes the whole suite.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/renderer/src/lib,src/renderer/src/components` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: M11 TerminalPane.tsx:134 (src/renderer/src/lib,src/renderer/src/components)
- last seen: 2026-09-09T21:51:27Z

### L-012 - Under a no-component-tests convention, push every AC-bearing decision (timestamp restart, trim threshold, preventDefault ordering) into the pure lib function and leave only DOM/clipboard calls in the component - state left in the component is verifiable by reading only and regresses silently.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/renderer/src/components` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: M12-M16 TerminalPane.tsx:104,123,199,203,206 (src/renderer/src/components)
- last seen: 2026-09-09T21:51:28Z

### L-013 - An AC that starts a timer 'WHEN the app copies X' must state explicitly whether an attempted copy of nothing also starts it - the implementation set the timestamp before the empty-selection guard, a behavior no AC covers and no test can flag.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs/features` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: TCU-05 vs TCU-19 (.specs/features)
- last seen: 2026-09-09T21:51:28Z

### L-014 - O fallback-fresh do respawn (id-agent sem agentSessionId -> [] ) ficou indiscriminado: sem teste de respawn de id-agent sem id, remover o guard nao quebra nada - adicionar teste respawn-sem-id -> plan sem flag.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: session-resume-on-respawn
- evidence: M6 (session-manager.ts:273) (src/main)
- last seen: 2026-09-11T00:29:19Z

### L-015 - Teste ANSI que apenas ENVOLVE o token com escapes nao discrimina o strip: o padrao casa no texto cru - a sequencia ESC precisa INTERROMPER o token (ex.: ses_<ESC>ansi) para o matcher sem strip falhar.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: session-resume-on-respawn
- evidence: M8 (session-manager.test.ts:453-460) (src/main)
- last seen: 2026-09-11T00:29:19Z

### L-016 - Ultimo-match-vence so e testado no seam; a politica de atualizacao do retainedId entre chunks no manager ficou indiscriminada - adicionar teste com dois ids completos em chunks separados.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: session-resume-on-respawn
- evidence: M7 (session-manager.ts:309) (src/main)
- last seen: 2026-09-11T00:29:19Z

### L-017 - AC negativo (sem correcao/retry de id stale) precisa de assercao de ausencia (ex.: contagem de handles por respawn), senao fica sem evidencia no evidence-or-zero.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: session-resume-on-respawn
- evidence: RSMR-20 (src/main)
- last seen: 2026-09-11T00:29:19Z

### L-018 - Matar antes de imprimir id: falta teste de killAll sem id (campo ausente) e de respawn de id-agent sem id (fresh) - o ramo existe no codigo mas nenhuma assercao o toca.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: session-resume-on-respawn
- evidence: RSMR-19 (src/main)
- last seen: 2026-09-11T00:29:20Z

### L-019 - Numercao de requirements trocada entre tasks.md/design.md e a ordem literal dos bullets da spec (rename/continue-no-prior/last-wins) - comentarios de teste devem seguir a ordem literal da spec para rastreabilidade sem ambiguidade.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: session-resume-on-respawn
- evidence: tasks.md T2 / design.md (RSMR-23/24/25) (docs)
- last seen: 2026-09-11T00:29:20Z

### L-020 - Design afirmou que claude-help.txt carrega codes ANSI (0 bytes ESC medidos): antes de afirmar que um fixture exercita um caminho, medir os bytes reais do fixture.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: session-resume-on-respawn
- evidence: design.md:110 (docs)
- last seen: 2026-09-11T00:29:20Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

# Validation: Session Resume on Respawn — PASS

**Date**: 2026-09-10 (Round 1) / 2026-09-10 (Round 2 re-verification)
**Spec**: `.specs/features/session-resume-on-respawn/spec.md`
**Diff range**: `origin/main..HEAD` (plan 8510bcf, T1 6d8e0da, T2 66ecfd7, T3 3ea3187, T4 1150fdf, T5 c1fade9, style 0b64852, F1–F4 986ffd4, F5 aa7c28b)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status     | Notes |
| ---- | ---------- | ----- |
| T1   | ✅ Done    | `commandKey` criado fresh em shared — confirmado que o renderer `terminal-keys.ts` no `main` não tem `commandKey` (grep: 0 ocorrências em `src/renderer/`), a deviação documentada procede |
| T2   | ✅ Done    | Seam fixture-backed; `ses_fa640905fffe5E4OeSEH33fBLM` é de fato o último id do sample gravado (linha 67 do JSON) |
| T3   | ✅ Done    | Correção "needs-quote-only" documentada e consistente com o repo (metacaractere → cotação provada em `spawn-plan.test.ts:97-102`) |
| T4   | ✅ Done    | 18 testes; orquestração completa |
| T5   | ✅ Done    | Traceability; validation.md é Verifier-owned |
| F1–F4 | ✅ Done    | `986ffd4` +5 testes fechando os 4 gaps do Round 1 (RSMR-19, ANSI-load-bearing, cross-chunk latest-wins, RSMR-20) |
| F5   | ✅ Done    | `aa7c28b` alinha RSMR-23/24/25 à ordem literal da spec e corrige a alegação ANSI do design.md |

---

## Spec-Anchored Acceptance Criteria

Numeração por ordem literal dos bullets da spec (P1=01..08, P2=09..13, P3=14..17, edge=18..25). Ambiguidade de numeração RSMR-23/24/25 resolvida no Round 2 (F5): rename=23, continue-sem-prior=24, last-wins=25, alinhado em design.md/tasks.md.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| RSMR-01 — WHERE id-mechanism THEN watch output stream | captura contínua do id impresso | `session-manager.test.ts:438-440` — `emitData('done\nopencode --session ses_f7273a311ffeAkg12W9sbfYKpt\r')` → `expect(config.get().sessions[0].agentSessionId).toBe('ses_f7273a311ffeAkg12W9sbfYKpt')` | ✅ PASS |
| RSMR-02 — WHEN id appears THEN retain latest match | último match vence (exit hint supersede tool id) | `resume-mechanism.test.ts:49-52` — `expect(extractResumeId('tool ses_old one\nopencode --session ses_new', mech)).toBe('ses_new')`; **Round 2**: cross-chunk no manager `session-manager.test.ts:471-479` — `emitData('...ses_old')` + `emitData('...ses_new')` → `expect(config.get().sessions[0].agentSessionId).toBe('ses_new')` (linha 478) | ✅ PASS |
| RSMR-03 — WHEN session stops THEN persist retained id | id gravado em `config.sessions` no stop | `session-manager.test.ts:439-440` — `manager.stop(view.id)` → `expect(config.get().sessions[0].agentSessionId).toBe('ses_f7273a311ffeAkg12W9sbfYKpt')` | ✅ PASS |
| RSMR-04 — WHEN app quits THEN persist before killing PTY | killAll grava antes do kill | `session-manager.test.ts:490-498` — `manager.killAll()` → `expect(port.handles[0].killed).toBe(true)` + `expect(config.get().sessions[0].agentSessionId).toBe('ses_quit')` | ✅ PASS |
| RSMR-05 — respawn injects persisted id (`--session <id>`) | `opencode --session ses_own` no novo plano | `session-manager.test.ts:520-529` — `expect(port.handles[1].plan.autoCommand).toBe('opencode --session ses_own')` (linha 528) | ✅ PASS |
| RSMR-06 — continue-agent respawn → `--continue` | `claude --continue` | `session-manager.test.ts:531-537` — `expect(port.handles[1].plan.autoCommand).toBe('claude --continue')` (linha 536) | ✅ PASS |
| RSMR-07 — no mechanism → exactly as today | `codex --full-auto` sem flag extra | `session-manager.test.ts:539-545` — `expect(port.handles[1].plan.autoCommand).toBe('codex --full-auto')` (linha 544); + `spawn-plan.ts:68` default `[]` mantém planos pré-existentes (`spawn-plan.test.ts:7-72` inalterados) | ✅ PASS |
| RSMR-08 — stop WITHOUT id → field stays absent | `agentSessionId` undefined | `session-manager.test.ts:509-516` — `expect(config.get().sessions[0].agentSessionId).toBeUndefined()` (linha 515) | ✅ PASS |
| RSMR-09 — spawn id-agent in cwd WHERE last session carries id → inject | `opencode --session ses_prior` | `session-manager.test.ts:571-578` — `expect(port.handles[0].plan.autoCommand).toBe('opencode --session ses_prior')`; + `resume-mechanism.test.ts:72-78` — `toEqual(['--session', 'ses_aaa'])` | ✅ PASS |
| RSMR-10 — continue-agent spawn WHERE prior session exists → `--continue` | `claude --continue` | `session-manager.test.ts:605-609` — `expect(port.handles[0].plan.autoCommand).toBe('claude --continue')`; + `resume-mechanism.test.ts:97-100` — `toEqual(['--continue'])` | ✅ PASS |
| RSMR-11 — last session belongs to DIFFERENT agent → no id | `opencode` sem flag | `session-manager.test.ts:580-587` — `expect(port.handles[0].plan.autoCommand).toBe('opencode')` (prior Claude com id); + `resume-mechanism.test.ts:88-91` — `toEqual([])` | ✅ PASS |
| RSMR-12 — no session matches → launch fresh | `opencode` / `claude` sem flag | `session-manager.test.ts:598-603,611-615` — `toBe('opencode')` / `toBe('claude')`; `resume-mechanism.test.ts:93-95` — `toEqual([])` | ✅ PASS |
| RSMR-13 — mechanism keyed on normalized bare command | path/`.exe`/case/renomeado resolvem | `command-key.test.ts:5-23` (path+bare, case, `.cmd`/`.bat`, segmento); `resume-mechanism.test.ts:30-33` (path/case → id); `:111-115` (comando path absoluto no registry → `['--session','ses_ccc']`) | ✅ PASS |
| RSMR-14 — parse pattern asserted vs recorded sample | último id do sample extraído | `resume-mechanism.test.ts:42-47` — `expect(extractResumeId(fixture('opencode-session-list.json'), mech)).toBe('ses_fa640905fffe5E4OeSEH33fBLM')` — deviação #3 documentada (sample = `session list --format json`, não o exit-hint interativo) | ✅ PASS (deviação documentada) |
| RSMR-15 — continue mechanism vs recorded `--help` | `--session` / `--continue` presentes | `resume-mechanism.test.ts:61-69` — `expect(fixture('opencode-help.txt')).toContain('--session')` (linha 48 real); `expect(fixture('claude-help.txt')).toContain('--continue')` (linha 63 real) | ✅ PASS |
| RSMR-16 — no mechanism → never attempt | `null` p/ codex/pwsh; `[]` mesmo com sessão casando | `resume-mechanism.test.ts:35-38` — `expect(resolveMechanism('codex')).toBeNull()`; `:106-109` — `toEqual([])` | ✅ PASS |
| RSMR-17 — no-mechanism launch byte-identical | planos de hoje inalterados | `spawn-plan.ts:68` (`tokens = [...agent.args, ...resumeArgs]` com default `[]`) + testes pré-existentes inalterados `spawn-plan.test.ts:7-72` + casos fresh `session-manager.test.ts:544,602` | ✅ PASS |
| RSMR-18 — split across chunks + ANSI still detected | `ses_abc123` (split); `ses_ansi` (ANSI) | split: `session-manager.test.ts:443-451` — `toBe('ses_abc123')`; ANSI: `:453-460` — `toBe('ses_ansi')`; **Round 2** interrupt: `:462-469` — `emitData('opencode --session ses_\x1b[0mansi\r')` → `expect(config.get().sessions[0].agentSessionId).toBe('ses_ansi')` (linha 468, strip load-bearing) | ✅ PASS |
| RSMR-19 — killed before printing id → nothing retained, respawn falls back | id não retido; respawn cai p/ continue ou fresh | **Round 2**: killAll sem id `session-manager.test.ts:500-509` — `expect(config.get().sessions[0].agentSessionId).toBeUndefined()` (linha 508); respawn fresh `:547-556` — stop sem id → `expect(config.get().sessions[0].agentSessionId).toBeUndefined()` (553) + `expect(port.handles[1].plan.autoCommand).toBe('opencode')` (555) | ✅ PASS |
| RSMR-20 — stale/rejected id → no correction or retry | app não corrige nem reintenta | **Round 2**: `session-manager.test.ts:558-567` — respawn com id stale → `expect(port.handles).toHaveLength(2)` (565, original + exatamente um respawn) + `expect(config.get().sessions).toHaveLength(1)` (566, nenhuma sessão recriada) | ✅ PASS |
| RSMR-21 — duplicate does NOT inherit id | clone sem `agentSessionId`, spawn fresh | `session-manager.test.ts:619-629` — `expect(cloned?.agentSessionId).toBeUndefined()`; `expect(port.handles.at(-1)?.plan.autoCommand).toBe('opencode')` | ✅ PASS |
| RSMR-22 — remove drops id with session | sessões esvaziam | `session-manager.test.ts:641-649` — `expect(config.get().sessions).toHaveLength(0)` | ✅ PASS |
| RSMR-23 — rename keeps id (title-only) | id preservado | `session-manager.test.ts:631-638` — `expect(config.get().sessions[0].agentSessionId).toBe('ses_ren')` | ✅ PASS |
| RSMR-24 — continue-agent no prior session → NO `--continue` | `[]` / `claude` sem flag | `resume-mechanism.test.ts:102-104` — `expect(resolveResumeArgs([], AGENTS, CWD, 'claude')).toEqual([])`; `session-manager.test.ts:611-615` — `toBe('claude')` | ✅ PASS |
| RSMR-25 — several sessions same cwd → LAST in `config.sessions` order | `ses_bbb` vence | `resume-mechanism.test.ts:80-86` — `expect(resolveResumeArgs(sessions, AGENTS, CWD, 'opencode')).toEqual(['--session', 'ses_bbb'])` | ✅ PASS |

**Status**: ✅ 25/25 ACs com evidência spec-anchored (23 no Round 1 + RSMR-19/20 fechados no Round 2; RSMR-02/18 reforçados com asserções load-bearing)

---

## Discrimination Sensor

### Round 1 (original)

Scratch: `%TEMP%\opencode\verifier-session-resume-on-respawn` (cópia de `src/`, `package.json`, `vitest.config.ts`, fixtures; junction `node_modules`). Pristino: 84/84 testes dos 4 arquivos em escopo passam.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `src/main/resume-mechanism.ts:45` | `extractResumeId` devolve o PRIMEIRO match (`matches[0][1]`) em vez do último | ✅ Killed — `resume-mechanism.test.ts:42-47` (sample fixture) e `:49-52` (last-wins) |
| M2 | `src/main/resume-mechanism.ts:64-68` | `resolveResumeArgs` guarda a PRIMEIRA sessão casada | ✅ Killed — `resume-mechanism.test.ts:80-86` (last em ordem de array) |
| M3 | `src/main/session-manager.ts:336` | `#finalize` deixa de persistir o id retido (spread removido) | ✅ Killed — 7 testes: `session-manager.test.ts:440,450,459,468,478,577,588` |
| M4 | `src/main/resume-mechanism.ts:60` | `resolveResumeArgs` devolve `[]` incondicional (spawn nunca resume) | ✅ Killed — 6 testes: bloco `resolveResumeArgs` do seam + `session-manager.test.ts:527,558` |
| M5 | `src/main/spawn-plan.ts:68` | `resumeArgs` anexados ANTES de `agent.args` | ✅ Killed — `spawn-plan.test.ts:90-95` (agente args antes da flag de resume) |
| M6 | `src/main/session-manager.ts:273` | respawn de id-agent SEM id capturado injeta mesmo assim (guarda removida) | ❌ Survived (Round 1) → **✅ Killed no Round 2** |
| M7 | `src/main/session-manager.ts:309` | `retainedId` nunca sobrescrito em chunks posteriores | ❌ Survived (Round 1) → **✅ Killed no Round 2** |
| M8 | `src/main/session-manager.ts:305` | strip ANSI removido da captura | ❌ Survived (Round 1) → **✅ Killed no Round 2** |

**Round 1 result**: 5/8 killed — 3 survivors → fix tasks F1–F4.

### Round 2 (re-verification, fresh scratch `%TEMP%\opencode\verifier-session-resume-on-respawn-r2`)

Pristino: 89/89 testes dos 4 arquivos em escopo passam (84 + 5 novos). Mutantes aplicados um a um, arquivo restaurado exatamente entre cada um; scratch apagado; `git status --porcelain` da árvore real **MATCH** com o baseline do Round 2 (somente o store de lições modificado — bookkeeping do passo 10 — e os dirs untracked pré-existentes + `validation.md`; zero arquivos de origem modificados).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M6 (re-run) | `src/main/session-manager.ts:273` | respawn de id-agent SEM id injeta mesmo assim (guarda do ternário removida) | ✅ **Killed** — 1 falha: `session-manager.test.ts:547-556` (RSMR-19, espera `'opencode'`) |
| M7 (re-run) | `src/main/session-manager.ts:309` | `retainedId` nunca sobrescrito por chunks posteriores (`&& retainedId === null`) | ✅ **Killed** — 1 falha: `session-manager.test.ts:471-479` (cross-chunk latest-wins, espera `ses_new`) |
| M8 (re-run) | `src/main/session-manager.ts:305` | strip ANSI removido (`data` cru no captureTail) | ✅ **Killed** — 1 falha: `session-manager.test.ts:462-469` (escape interrompe o token, espera `ses_ansi`) |
| M1 (spot-check) | `src/main/resume-mechanism.ts:45` | `extractResumeId` primeiro match | ✅ Killed — 2 falhas: `resume-mechanism.test.ts:42-47` e `:49-52` |
| M2 (spot-check) | `src/main/resume-mechanism.ts:64-68` | `resolveResumeArgs` primeira sessão | ✅ Killed — 1 falha: `resume-mechanism.test.ts:80-86` |

**Round 2 result**: 5/5 killed (os 3 sobreviventes do Round 1 + 2 spot-checks do caminho principal continuam mortos). **Cumulativo: 8/8.**

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — seams pequenos e puros; nenhuma abstração para uso único |
| Surgical changes | ✅ — 6 arquivos de origem; renderer intocado (deviação T1 verificada); fixes F1–F4 = adições de teste apenas, F5 = docs |
| No scope creep | ✅ — nada fora do diff surface; `buildRawSpawnPlan` intocado |
| Matches patterns | ✅ — harness `makeManager`/fake `PtyPort` reutilizado; fixture rule seguida; strip ANSI local no padrão `ansi.ts` |
| Spec-anchored outcome check | ✅ — 25/25; as 5 novas asserções miram o outcome exato da spec (plan sem flag, campo ausente, `ses_new`, `ses_ansi`, contagem de handles) |
| Per-layer Coverage Expectation | ✅ — domínio 1:1; ramos de borda agora discriminados (M6/M7/M8 mortos) |
| Every test maps to a spec requirement | ✅ — os 47 testes novos mapeiam a RSMR/edge/Done-when; nenhum órfão |
| Documented guidelines | ✅ — `TESTING.md` (main-side unit-tested), fixture rule, gate `npx vitest run --maxWorkers=2` |

---

## Edge Cases

- [x] Split entre chunks + ANSI (RSMR-18) — `:443-451` (split), `:453-460` (wrap), `:462-469` (interrupt — strip load-bearing)
- [x] Killed antes de imprimir id (RSMR-19) — `:500-509` (killAll sem id), `:547-556` (respawn fresh)
- [x] Stale/rejected id → sem correção/retry (RSMR-20) — `:558-567` (exatamente um novo PTY, nenhuma sessão recriada)
- [x] Duplicate não herda id (RSMR-21) — `:619-629`
- [x] Remove descarta id (RSMR-22) — `:641-649`
- [x] Rename preserva id (RSMR-23) — `:631-638`
- [x] Continue-sem-prior → sem flag (RSMR-24) — `:102-104`, `:611-615`
- [x] Várias sessões no mesmo cwd → última em ordem (RSMR-25) — `:80-86`

---

## Gate Check

- **Gate command**: `npx vitest run --maxWorkers=2` + `npm run typecheck` + `npm run lint`
- **Result (Round 2)**: vitest **715 passed / 0 failed / 0 skipped** (46 files); typecheck limpo; lint 0 errors (19 warnings prettier pré-existentes, fora do diff)
- **Test count before feature**: 668 (44 files, main 2026-09-10)
- **Test count after feature**: 715 (46 files; +5 do Round 2)
- **Delta**: +47 tests, +2 files — zero deleções; nenhum assert enfraquecido
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans (Round 1 gaps — RESOLVED no Round 2)

### Fix 1 (Major, RESOLVED) — RSMR-19: respawn de id-agent sem id capturado deve cair em fresh
- Aplicado em `986ffd4`: `session-manager.test.ts:547-556` (respawn → `'opencode'`) + `:500-509` (killAll sem id → campo ausente). M6 agora morto.

### Fix 2 (Major, RESOLVED) — ANSI strip indiscriminado (M8)
- Aplicado em `986ffd4`: `session-manager.test.ts:462-469` — escape **interrompe** o token (`ses_\x1b[0mansi`); sem strip, nenhum match. M8 agora morto. Nota de precisão F5 corrige a alegação do design.md (0 bytes ESC medidos nos fixtures de help).

### Fix 3 (Minor, RESOLVED) — RSMR-20: sem asserção para "no correction or retry"
- Aplicado em `986ffd4`: `session-manager.test.ts:558-567` — `toHaveLength(2)` (um único respawn) + `toHaveLength(1)` (nenhuma sessão recriada).

### Fix 4 (Minor, RESOLVED) — latest-wins cross-chunk no manager (M7)
- Aplicado em `986ffd4`: `session-manager.test.ts:471-479` — `ses_old` + `ses_new` em chunks separados → persistido `ses_new`. M7 agora morto.

### Nota de precisão (RESOLVIDA) — numeração RSMR-23/24/25
- Aplicado em `aa7c28b`: design.md/tasks.md alinhados à ordem literal da spec (rename=23, continue-no-prior=24, last-wins=25).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| RSMR-01..18, RSMR-21..25 | Verified | ✅ Verified (evidência confirmada Round 1) |
| RSMR-19 | ❌ Needs Fix (Round 1) | ✅ **Verified** (Round 2 — `:500-509`, `:547-556`; M6 morto) |
| RSMR-20 | ❌ Needs Fix (Round 1) | ✅ **Verified** (Round 2 — `:558-567`) |

---

## Summary

**Overall**: **PASS** — 25/25 ACs spec-anchored; sensor 8/8 cumulativo (5 no Round 1 + 3 ex-sobreviventes mortos no Round 2); gate 715 passed.

**Spec-anchored check**: 25/25 ACs com evidência spec-anchored (0 gaps restantes)
**Sensor**: 8/8 mutações killed (Round 1: 5/8; Round 2: 3/3 ex-sobreviventes + 2/2 spot-checks)
**Gate**: 715 passed, typecheck/lint limpos

**What works**: captura contínua + last-wins (dentro do chunk, entre chunks e no respawn-fresh), persistência em stop/onExit/killAll, injeção em respawn/spawn (id e continue), duplicate/remove/rename, comando normalizado, fixture rule cumprida, planos byte-idênticos sem resumeArgs, ausência de retry. Todos os ramos de borda do Round 1 agora são discriminados por teste.

**Issues found**: nenhum gap restante. Notas honestas mantidas (deviações documentadas): (1) T1 criou `commandKey` fresh em shared (renderer do `main` não o tinha); (2) T3 needs-quote-only; (3) fixture de prova do padrão é o `opencode session list --format json` (o wording do exit-hint interativo nunca foi gravado — o token `ses_…` é extraído diretamente).

**Next steps**: nenhum — feature pronta para merge/uso local. Re-verificação concluída na iteração 1 de 3.
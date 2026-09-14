/* CDP smoke for the Agents Rail v2 (RAIL-17, 18, 23, 24 + grouping). Proves the
 * slice that unit tests structurally cannot — real DOM grouping, selection,
 * action isolation and keyboard traversal — against a running dev app:
 *   1. two sessions on ONE task-tagged worktree render as ONE group with TWO
 *      rows, and a detached session gets its own single-row orphan group
 *      (RAIL-02, RAIL-06, RAIL-09)
 *   2. every icon-only row action button carries a non-empty aria-label (RAIL-24)
 *   3. clicking a row selects it, tints the row and outlines its group (RAIL-18)
 *   4. clicking a row's action button fires the action and does NOT change the
 *      selected session (RAIL-17)
 *   5. ArrowDown across a group boundary moves focus only — aria-selected is
 *      unchanged — Enter then selects; ArrowUp returns focus across the same
 *      boundary and Space selects (RAIL-21, RAIL-22, RAIL-23)
 *
 * NOT automatable here (hand-verify):
 *   - the two-theme visual pass: pills, 22x22 tiles, status dots, hover and the
 *     active-row tint at 344px in both light and dark, across all four seeded
 *     agent tints plus the ad-hoc amber (opencode and Ad-hoc share --amber)
 *   - RAIL-26: a task title longer than two lines clamps at two with no
 *     horizontal overflow — computed line-clamp does not prove how it reads
 *   - RAIL-27: a session whose stored agent matches no registry entry still
 *     renders a tinted tile (needs a hand-edited config with an unknown agent)
 *
 * Seeding needs a registered workspace holding a worktree whose branch yields a
 * task ID (e.g. `user/<you>/24173-slug`); without one there is nothing to group
 * and the script reports that rather than passing silently.
 *
 * Agents are shell-hosted, so `claude`/`codex` need not be installed — pwsh
 * stays live and streams, which is enough to prove the wiring.
 *
 * This script starts from a clean slate: it stops and removes every existing
 * session before seeding, and again on the way out.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-rail-v2.mjs                    (in another)
 */

const PORT = Number(process.env.SMOKE_PORT) || 9222
const DETACHED_CWD = 'C:/Windows'

async function pageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('No CDP page target after 30s')
}

let nextId = 1
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  const r = result.result
  if (r.subtype === 'error') throw new Error(r.description)
  return r.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function summarise(ws) {
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send(ws, 'Runtime.enable')

for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await sleep(1000)
}

// Rail helpers, installed once in the page so every expression below stays short.
// Rows carry no id attribute, so the row label is the DOM-side identity.
await evaluate(
  ws,
  `(() => {
     const text = (el, sel) => (el.querySelector(sel)?.textContent ?? '').trim()
     window.__rail = {
       text,
       rows: () => [...document.querySelectorAll('.rail-row')],
       row: (label) => window.__rail.rows().find((r) => text(r, '.rail-row-label') === label),
       selected: () => {
         const r = document.querySelector('.rail-row[aria-selected="true"]')
         return r ? text(r, '.rail-row-label') : null
       },
       key: (el, k) =>
         el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
     }
     return true
   })()`
)

// Switch to the Agents direction.
await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent))
     if (seg) seg.click()
     return true
   })()`
)
await sleep(400)

// --- Clean slate: the grouping assertions count every card in the rail ---
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {} }
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
     return true
   })()`
)
await sleep(400)

// --- Seed: find a worktree whose branch yields a task ID (mirrors taskIdFromBranch) ---
const wt = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const taskId = (branch) => {
         const segments = branch.split('/').filter((s) => s !== '')
         const last = segments[segments.length - 1]
         if (last === undefined) return null
         const m = /(?<![A-Za-z0-9])\\d{2,}(?![A-Za-z0-9])/.exec(last)
         return m ? Number(m[0]) : null
       }
       for (const wsNode of await window.api.invoke('tree:get')) {
         for (const repo of wsNode.repos ?? []) {
           for (const w of repo.worktrees ?? []) {
             const id = taskId(w.branch)
             if (id !== null) return JSON.stringify({ path: w.path, branch: w.branch, taskId: id })
           }
         }
       }
       return JSON.stringify(null)
     })()`
  )
)
if (!wt) {
  check(
    'a task-tagged worktree is registered (grouping seed)',
    false,
    'register a workspace holding a user/<you>/<id>-<slug> worktree, then re-run'
  )
  summarise(ws)
}
check('a task-tagged worktree is registered (grouping seed)', true, `${wt.branch} → #${wt.taskId}`)

// Two sessions on that one worktree + one detached session elsewhere. Direct-IPC
// spawns push no event, so the rail is stale until a session:status fires — stop
// the detached one, which the App subscribes to and re-fetches on.
await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Claude', cwd: ${JSON.stringify(wt.path)} })).id)()`
)
const id2 = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Claude', cwd: ${JSON.stringify(wt.path)} })).id)()`
)
const id3 = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Codex', cwd: '${DETACHED_CWD}' })).id)()`
)
await evaluate(
  ws,
  `(async () => { await window.api.invoke('sessions:stop', { id: '${id3}' }); return true })()`
)
await sleep(900)

// --- 1. Grouping: one two-row task group + one single-row orphan group ---
const shape = JSON.parse(
  await evaluate(
    ws,
    `(() => {
       const groups = [...document.querySelectorAll('.rail-group')]
       return JSON.stringify({
         rowsPerGroup: groups.map((g) => g.querySelectorAll('.rail-row').length),
         taskIds: groups.map((g) => window.__rail.text(g, '.rail-group-id')).filter((t) => t !== ''),
         orphanNote: window.__rail.text(document.body, '.rail-group-note.detached')
       })
     })()`
  )
)
const twoRow = shape.rowsPerGroup.filter((n) => n === 2)
const oneRow = shape.rowsPerGroup.filter((n) => n === 1)
check(
  'two sessions on one worktree render as ONE group with TWO rows',
  shape.rowsPerGroup.length === 2 && twoRow.length === 1 && oneRow.length === 1,
  `rows per group: [${shape.rowsPerGroup.join(', ')}]`
)
check(
  'the task id is stated once, on the group header',
  shape.taskIds.length === 1 && shape.taskIds[0] === `#${wt.taskId}`,
  `${shape.taskIds.join(' / ') || 'none'}`
)
check(
  'the detached session gets its own single-row orphan group',
  oneRow.length === 1 && shape.orphanNote.startsWith('detached · '),
  shape.orphanNote || 'no detached note'
)

// --- 2. RAIL-24: every action button is labelled ---
const labels = JSON.parse(
  await evaluate(
    ws,
    `(() => {
       const btns = [...document.querySelectorAll('.rail-row-btn')]
       return JSON.stringify({
         total: btns.length,
         unlabelled: btns.filter((b) => (b.getAttribute('aria-label') ?? '').trim() === '').length
       })
     })()`
  )
)
check(
  'every row action button carries a non-empty aria-label',
  labels.total > 0 && labels.unlabelled === 0,
  `${labels.total} buttons, ${labels.unlabelled} unlabelled`
)

// --- 3. RAIL-18: clicking a row selects it, tints it and outlines its group ---
const selection = JSON.parse(
  await evaluate(
    ws,
    `(() => {
       const other = window.__rail.row('Codex')
       const before = {
         row: getComputedStyle(other).backgroundColor,
         group: getComputedStyle(other.closest('.rail-group')).borderColor
       }
       const target = window.__rail.row('Claude 1')
       target.click()
       const rows = [...document.querySelectorAll('.rail-row')]
       const group = target.closest('.rail-group')
       return JSON.stringify({
         selected: window.__rail.selected(),
         ariaSelected: target.getAttribute('aria-selected'),
         rowClass: target.classList.contains('selected'),
         groupClass: group.classList.contains('selected'),
         rowTinted: getComputedStyle(target).backgroundColor !== before.row,
         groupOutlined: getComputedStyle(group).borderColor !== before.group,
         // RAIL-20's negative half: without these, an implementation that sets
         // aria-selected="true" on EVERY row passes every other assertion here.
         trueCount: rows.filter((r) => r.getAttribute('aria-selected') === 'true').length,
         othersAllFalse: rows
           .filter((r) => r !== target)
           .every((r) => r.getAttribute('aria-selected') === 'false')
       })
     })()`
  )
)
check(
  'clicking a row selects it (aria-selected + selected class)',
  selection.selected === 'Claude 1' &&
    selection.ariaSelected === 'true' &&
    selection.rowClass === true,
  `selected: ${selection.selected}`
)
check(
  'the selected row is tinted and its group card outlined (RAIL-18)',
  selection.groupClass === true && selection.rowTinted === true && selection.groupOutlined === true,
  `row tint ${selection.rowTinted}, group border ${selection.groupOutlined}`
)
check(
  'exactly one row reports aria-selected=true, every other reports false (RAIL-20)',
  selection.trueCount === 1 && selection.othersAllFalse === true,
  `true count ${selection.trueCount}, others all false: ${selection.othersAllFalse}`
)

// --- 4. RAIL-17: an action button acts without changing the selection ---
const acted = await evaluate(
  ws,
  `(() => {
     const btn = window.__rail.row('Claude 2').querySelector('.rail-row-btn[aria-label="Stop Claude 2 session"]')
     if (!btn) return false
     btn.click()
     return true
   })()`
)
await sleep(900)
const afterAction = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const list = await window.api.invoke('sessions:list')
       return JSON.stringify({
         stopped: list.find((s) => s.id === '${id2}')?.status,
         selected: window.__rail.selected()
       })
     })()`
  )
)
check(
  'a row action button fires its action',
  acted === true && afterAction.stopped === 'stopped',
  `Claude 2 is ${afterAction.stopped}`
)
check(
  'a row action button does NOT change the selected session (RAIL-17)',
  afterAction.selected === 'Claude 1',
  `selected: ${afterAction.selected}`
)

// --- 5. RAIL-21/22/23: arrows move focus, Enter and Space select ---
// Each key press and the DOM read that judges it are SEPARATE evaluate calls.
// A React state update committed inside a keydown handler is not reflected in
// the DOM until React re-renders; reading aria-selected in the same synchronous
// block as the dispatch reads the pre-update DOM and reports a false FAIL.
// Focus moves are a direct DOM side effect, so those may be read immediately.
const arrowDown = JSON.parse(
  await evaluate(
    ws,
    `(() => {
       const last = window.__rail.row('Claude 2')
       last.focus()
       window.__rail.key(last, 'ArrowDown')
       const focused = document.activeElement
       return JSON.stringify({
         moved: focused === window.__rail.row('Codex'),
         crossedGroups: last.closest('.rail-group') !== focused.closest('.rail-group')
       })
     })()`
  )
)
await sleep(250)
const selectedAfterArrow = await evaluate(ws, `window.__rail.selected()`)
check(
  'ArrowDown moves focus across a group boundary without selecting (RAIL-21)',
  arrowDown.moved === true && arrowDown.crossedGroups === true && selectedAfterArrow === 'Claude 1',
  `focus moved ${arrowDown.moved}, still selected: ${selectedAfterArrow}`
)

await evaluate(ws, `window.__rail.key(document.activeElement, 'Enter')`)
await sleep(250)
const selectedAfterEnter = await evaluate(ws, `window.__rail.selected()`)
check(
  'Enter selects the focused row (RAIL-23)',
  selectedAfterEnter === 'Codex',
  `selected: ${selectedAfterEnter}`
)

// RAIL-22: ArrowUp is the mirror branch; press it rather than trust that it
// shares ArrowDown's code path.
const movedBack = await evaluate(
  ws,
  `(() => {
     window.__rail.key(document.activeElement, 'ArrowUp')
     return document.activeElement === window.__rail.row('Claude 2')
   })()`
)
check(
  'ArrowUp moves focus back across the group boundary (RAIL-22)',
  movedBack === true,
  `focus returned to Claude 2: ${movedBack}`
)

// RAIL-23 names Enter AND Space.
await evaluate(ws, `window.__rail.key(document.activeElement, ' ')`)
await sleep(250)
const selectedAfterSpace = await evaluate(ws, `window.__rail.selected()`)
check(
  'Space selects the focused row (RAIL-23)',
  selectedAfterSpace === 'Claude 2',
  `selected: ${selectedAfterSpace}`
)

// --- Cleanup: stop + remove every smoke session ---
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {} }
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
     return true
   })()`
)
const remaining = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:list')).length)()`
)
check('cleanup removed the smoke sessions', remaining === 0, `${remaining} left`)

summarise(ws)

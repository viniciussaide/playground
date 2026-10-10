import { describe, expect, it } from 'vitest'
import type {
  AdoThreadStatus,
  GitHubPrFile,
  PrRef,
  PrThreadPlace,
  PrThreadView
} from '../../../shared/files'
import { tabKeyOf } from './diff-view'
import { renderMarkdown } from './markdown'
import {
  commentPlan,
  OFFERED_STATUSES,
  overviewGroups,
  prKey,
  prLabel,
  revisionBanner,
  statusLabel,
  zonesForFile
} from './pr-view'

// Every name here is fictitious: this repository is public.

function thread(
  id: number,
  place: PrThreadPlace,
  resolution: PrThreadView['resolution'] = 'active'
): PrThreadView {
  return {
    id,
    rootCommentId: 1,
    resolution,
    providerStatus: resolution === 'active' ? 'active' : 'fixed',
    comments: [{ id: 1, author: 'Robin Widget', content: `Thread ${id}`, at: 0 }],
    place
  }
}

const onLine = (line: number): PrThreadPlace => ({
  kind: 'placed',
  path: 'src/app.ts',
  side: 'right',
  startLine: line,
  endLine: line
})

describe('overviewGroups (FPRA-11, 13, 19, 20)', () => {
  it('splits threads placed in the diff into active and resolved, in publication order', () => {
    const groups = overviewGroups([
      thread(1, onLine(3)),
      thread(2, onLine(9), 'resolved'),
      thread(3, { kind: 'placed', path: 'src/old.ts', side: 'left', startLine: 2, endLine: 2 }),
      thread(4, onLine(1), 'resolved')
    ])

    expect(groups.active.map((t) => t.id)).toEqual([1, 3])
    expect(groups.resolved.map((t) => t.id)).toEqual([2, 4])
    expect(groups.outdated).toEqual([])
    expect(groups.general).toEqual([])
    expect(groups.activity).toEqual([])
  })

  it('lists outdated, general and system threads each in their own group only', () => {
    const outdated = thread(5, { kind: 'outdated', path: 'src/app.ts', line: 2 })
    const general = thread(6, { kind: 'general' })
    const system = thread(7, { kind: 'system' })

    expect(overviewGroups([outdated, general, system])).toEqual({
      active: [],
      resolved: [],
      outdated: [outdated],
      general: [general],
      activity: [system]
    })
  })

  it('shows deleted threads in no group', () => {
    const groups = overviewGroups([thread(8, { kind: 'deleted' }), thread(9, onLine(4))])

    expect(
      Object.values(groups)
        .flat()
        .map((t) => t.id)
    ).toEqual([9])
  })
})

describe('statusLabel and OFFERED_STATUSES (FPRA-26)', () => {
  const ALL: AdoThreadStatus[] = [
    'active',
    'fixed',
    'wontFix',
    'closed',
    'byDesign',
    'pending',
    'unknown'
  ]

  it('labels every Azure DevOps thread status', () => {
    // [owner 2026-10-10] `fixed` reads "Resolved", as Azure DevOps' web view names it.
    expect(ALL.map(statusLabel)).toEqual([
      'Active',
      'Resolved',
      "Won't fix",
      'Closed',
      'By design',
      'Pending',
      'Unknown'
    ])
  })

  it('offers every status a thread can be set to, and never unknown', () => {
    expect([...OFFERED_STATUSES].sort()).toEqual(ALL.filter((s) => s !== 'unknown').sort())
  })
})

describe('zonesForFile (FPRA-18)', () => {
  const place = (
    path: string,
    side: 'left' | 'right',
    startLine: number,
    endLine: number
  ): PrThreadPlace => ({ kind: 'placed', path, side, startLine, endLine })

  it('takes only the threads drawn in this file', () => {
    const mine = thread(1, place('src/app.ts', 'right', 3, 3))
    const zones = zonesForFile(
      [
        mine,
        thread(2, place('src/other.ts', 'right', 3, 3)),
        thread(3, { kind: 'outdated', path: 'src/app.ts', line: 3 }),
        thread(4, { kind: 'general' }),
        thread(5, { kind: 'system' }),
        thread(6, { kind: 'deleted' })
      ],
      'src/app.ts'
    )

    expect(zones).toEqual({ left: [], right: [{ afterLine: 3, thread: mine }] })
  })

  it("puts each thread on its own side, after the thread's end line, resolved ones included", () => {
    const original = thread(1, place('src/app.ts', 'left', 2, 2))
    const modified = thread(2, place('src/app.ts', 'right', 4, 6), 'resolved')

    expect(zonesForFile([original, modified], 'src/app.ts')).toEqual({
      left: [{ afterLine: 2, thread: original }],
      right: [{ afterLine: 6, thread: modified }]
    })
  })

  it('gives two threads on the same line a zone each, in publication order', () => {
    const first = thread(7, place('src/app.ts', 'right', 9, 9))
    const second = thread(8, place('src/app.ts', 'right', 9, 9))

    expect(zonesForFile([first, second], 'src/app.ts').right).toEqual([
      { afterLine: 9, thread: first },
      { afterLine: 9, thread: second }
    ])
  })
})

describe('revisionBanner (FPRA-34, FPRG-25)', () => {
  it('shows when the latest iteration is newer than the one on screen', () => {
    expect(revisionBanner('3', '4')).toBe(true)
  })

  it('does not show for the same iteration, or before anything is on screen', () => {
    expect(revisionBanner('4', '4')).toBe(false)
    expect(revisionBanner(null, '4')).toBe(false)
  })

  // A revision is opaque and only compared (design N2). F4's "an older
  // iteration shows no banner" cannot be kept: an iteration only grows, so
  // the case never arises, and a GitHub head commit has no order at all.
  it('shows for any revision other than the one on screen, a changed head commit included', () => {
    const head = '0f2b9c1d4e6a8b3c5d7e9f0a1b2c3d4e5f6a7b8c'
    const pushed = '9e8d7c6b5a40312f1e0d9c8b7a6f5e4d3c2b1a09'

    expect(revisionBanner(head, pushed)).toBe(true)
    expect(revisionBanner(head, head)).toBe(false)
    expect(revisionBanner(null, pushed)).toBe(false)
    expect(revisionBanner('4', '3')).toBe(true)
  })
})

describe('prKey and prLabel (FPRG-07)', () => {
  const ado = (id: number, org = 'acme'): PrRef => ({
    target: { provider: 'azure-devops', org, project: 'platform', repo: 'widget' },
    id
  })
  const github = (id: number): PrRef => ({
    target: { provider: 'github', owner: 'acme', repo: 'widget' },
    id
  })

  it('keeps pull requests with one number apart across providers and repositories, case aside', () => {
    expect(prKey(ado(7))).not.toBe(prKey(github(7)))
    expect(prKey(ado(7))).not.toBe(prKey(ado(7, 'contoso')))
    expect(prKey(ado(7))).not.toBe(prKey(ado(8)))
    expect(prKey(ado(7))).toBe(prKey(ado(7, 'ACME')))
    // Edge case: their PR diff tabs stay apart too.
    expect(tabKeyOf({ kind: 'pr-diff', pr: ado(7), path: 'src/app.ts' })).not.toBe(
      tabKeyOf({ kind: 'pr-diff', pr: github(7), path: 'src/app.ts' })
    )
  })

  it('reads an Azure DevOps number as !7 and a GitHub one as #7', () => {
    expect(prLabel(ado(7))).toBe('!7')
    expect(prLabel(github(7))).toBe('#7')
  })
})

describe('commentPlan (FPRG-19, 20, 21, 22)', () => {
  const ADO_PR: PrRef = {
    target: { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' },
    id: 7
  }
  const GITHUB_PR: PrRef = { target: { provider: 'github', owner: 'acme', repo: 'widget' }, id: 7 }
  // The file T1 measured on (S1): lines 5 and 30 changed, new-side hunks 2–8 and 27–33.
  const patched: GitHubPrFile = {
    path: 'src/app.ts',
    status: 'modified',
    hunks: [
      { newStart: 2, newEnd: 8 },
      { newStart: 27, newEnd: 33 }
    ]
  }
  const select = (
    startLine: number,
    endLine: number,
    text = 'const a = 1'
  ): { startLine: number; endLine: number; text: string } => ({ startLine, endLine, text })
  const anchored = (startLine: number, endLine: number): unknown => ({
    kind: 'anchored',
    anchor: { path: 'src/app.ts', startLine, endLine }
  })

  it('always anchors on an Azure DevOps pull request, as F4 does', () => {
    const file = { path: 'src/app.ts', status: 'modified' as const, changeTrackingId: 1 }

    // A range GitHub would refuse, and bottom-up, still anchors on Azure DevOps.
    expect(commentPlan(ADO_PR, file, select(18, 12))).toEqual(anchored(12, 18))
  })

  it('anchors a GitHub selection whose both ends lie in one hunk', () => {
    expect(commentPlan(GITHUB_PR, patched, select(5, 5))).toEqual(anchored(5, 5))
    expect(commentPlan(GITHUB_PR, patched, select(3, 7))).toEqual(anchored(3, 7))
    expect(commentPlan(GITHUB_PR, patched, select(8, 8))).toEqual(anchored(8, 8))
  })

  it('anchors a GitHub selection whose ends lie in two different hunks', () => {
    expect(commentPlan(GITHUB_PR, patched, select(5, 30))).toEqual(anchored(5, 30))
    expect(commentPlan(GITHUB_PR, patched, select(30, 5))).toEqual(anchored(5, 30))
  })

  it('posts a general comment, said by the banner and quoted by the citation, when an end lies outside every hunk', () => {
    expect(commentPlan(GITHUB_PR, patched, select(5, 18))).toEqual({
      kind: 'general',
      banner:
        'GitHub only anchors comments to diff lines. This one will be posted as a general ' +
        'comment citing src/app.ts:L5–L18.',
      citation: '`src/app.ts:L5–L18`\n\n```\nconst a = 1\n```'
    })
    // The first line after a hunk is outside it (S1).
    expect(commentPlan(GITHUB_PR, patched, select(9, 9))).toEqual({
      kind: 'general',
      banner:
        'GitHub only anchors comments to diff lines. This one will be posted as a general ' +
        'comment citing src/app.ts:L9.',
      citation: '`src/app.ts:L9`\n\n```\nconst a = 1\n```'
    })
    expect(commentPlan(GITHUB_PR, patched, select(18, 30)).kind).toBe('general')
    expect(commentPlan(GITHUB_PR, patched, select(12, 20)).kind).toBe('general')
  })

  it('treats every selection in a GitHub file with no patch as outside the diff', () => {
    const binary: GitHubPrFile = { path: 'docs/logo.svg', status: 'added', hunks: null }

    expect(commentPlan(GITHUB_PR, binary, select(1, 1)).kind).toBe('general')
    // A file that carries no hunks at all is no better known.
    expect(
      commentPlan(GITHUB_PR, { path: 'src/app.ts', status: 'modified' }, select(5, 5)).kind
    ).toBe('general')
  })

  it('cites a selection containing a fence as one code block with no live content', () => {
    const text =
      'before\n```\n<script>alert(1)</script>\n[docs](https://example.com) **bold**\n```\nafter'
    const plan = commentPlan(GITHUB_PR, patched, select(12, 17, text))
    if (plan.kind !== 'general') throw new Error('expected a general comment')

    const html = renderMarkdown(plan.citation)

    expect(html).toBe(
      '<p><code>src/app.ts:L12–L17</code></p>\n<pre><code>' +
        'before\n```\n&lt;script&gt;alert(1)&lt;/script&gt;\n' +
        '[docs](https://example.com) **bold**\n```\nafter\n</code></pre>\n'
    )
    expect(html.match(/<pre>/g)).toHaveLength(1)
    expect(html).not.toMatch(/<a\b|<strong>|<script/)
  })
})

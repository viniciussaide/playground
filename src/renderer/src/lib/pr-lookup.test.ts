import { describe, expect, it } from 'vitest'
import type { PrDetail, PrSearch, PrSummary, PrTarget } from '../../../shared/files'
import {
  EMPTY_LOOKUP,
  landRead,
  landSearches,
  providersToAsk,
  prsToRead,
  type PrLookupEntry
} from './pr-lookup'
import { prKey } from './pr-view'

const ADO: PrTarget = { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
const GH: PrTarget = { provider: 'github', owner: 'contoso', repo: 'widget' }

function summary(target: PrTarget, id: number): PrSummary {
  return { target, id, title: `Fix login redirect ${id}`, targetBranch: 'main', isDraft: false }
}

function detail(pr: PrSummary, revision: string): PrDetail {
  return { ...pr, revision, reviewers: [] } as unknown as PrDetail
}

function found(...prs: PrSummary[]): PrSearch {
  return { kind: 'found', prs }
}

function entry(change: Partial<PrLookupEntry>): PrLookupEntry {
  return { ...EMPTY_LOOKUP, ...change }
}

describe('providersToAsk', () => {
  it('skips a rate-limited provider on a reload that happens on its own (FPRG-26, SPRL-02)', () => {
    expect(providersToAsk(entry({ limited: ['github'] }), false)).toEqual({
      ask: ['azure-devops'],
      limited: ['github']
    })
  })

  it('asks every provider again on a reload the user asked for (FPRG-26, SPRL-01)', () => {
    expect(providersToAsk(entry({ limited: ['github'] }), true)).toEqual({
      ask: ['azure-devops', 'github'],
      limited: []
    })
  })
})

describe('landSearches', () => {
  it("keeps a provider's last answer when it was not asked (FPRG-26)", () => {
    const limitedAnswer: PrSearch = { kind: 'rate-limited', resetAt: 1000 }
    const before = entry({
      searches: { 'azure-devops': found(), github: limitedAnswer },
      limited: ['github']
    })
    const pr = summary(ADO, 7)
    const after = landSearches(before, { 'azure-devops': found(pr) }, ['github'])
    expect(after.searches).toEqual({ 'azure-devops': found(pr), github: limitedAnswer })
    expect(after.limited).toEqual(['github'])
  })

  it('remembers a provider that answered "rate limited" (FPRG-26)', () => {
    const after = landSearches(
      EMPTY_LOOKUP,
      { 'azure-devops': { kind: 'no-remote' }, github: { kind: 'rate-limited', resetAt: 1000 } },
      []
    )
    expect(after.limited).toEqual(['github'])
  })

  it('keeps the reads of the PRs already read, so a refresh does not drop their marks (SPRL-09)', () => {
    const pr = summary(GH, 12)
    const reads = { [prKey(pr)]: { detail: detail(pr, 'a1'), failure: null } }
    const after = landSearches(entry({ reads }), { github: found(pr) }, [])
    expect(after.reads).toBe(reads)
  })
})

describe('prsToRead', () => {
  it('reads every PR the searches found, in the providers order (SPRL-01)', () => {
    const ado = summary(ADO, 7)
    const a = summary(GH, 12)
    const b = summary(GH, 13)
    const prs = prsToRead(
      entry({ searches: { github: found(a, b), 'azure-devops': found(ado) } }),
      []
    )
    expect(prs.map(prKey)).toEqual([prKey(ado), prKey(a), prKey(b)])
  })

  it('also reads the PR on screen when the search no longer lists it, once (edge case)', () => {
    const listed = summary(GH, 12)
    const gone = summary(GH, 9)
    const prs = prsToRead(entry({ searches: { github: found(listed) } }), [gone, listed])
    expect(prs.map(prKey)).toEqual([prKey(listed), prKey(gone)])
  })

  it('reads nothing from a provider in the rate-limit memory (FPRG-26)', () => {
    const prs = prsToRead(
      entry({ searches: { github: found(summary(GH, 12)) }, limited: ['github'] }),
      [summary(GH, 9)]
    )
    expect(prs).toEqual([])
  })
})

describe('landRead', () => {
  const pr = summary(ADO, 7)
  const key = prKey(pr)

  it('stores a detail and clears the last failure', () => {
    const before = entry({
      reads: { [key]: { detail: null, failure: { provider: 'azure-devops', kind: 'auth' } } }
    })
    const fresh = detail(pr, '3')
    const after = landRead(before, pr, { kind: 'ok', detail: fresh })
    expect(after.reads[key]).toEqual({ detail: fresh, failure: null })
  })

  it('keeps the last good detail beside a failure (edge case)', () => {
    const shown = detail(pr, '2')
    const before = entry({ reads: { [key]: { detail: shown, failure: null } } })
    const after = landRead(before, pr, { kind: 'error', message: 'HTTP 500' }, true)
    expect(after.reads[key]).toEqual({
      detail: shown,
      failure: { provider: 'azure-devops', kind: 'error', message: 'HTTP 500' },
      afterWrite: true
    })
  })

  it('remembers a provider whose read answered "rate limited" (FPRG-26)', () => {
    const gh = summary(GH, 12)
    const after = landRead(EMPTY_LOOKUP, gh, { kind: 'rate-limited', resetAt: 1000 })
    expect(after.limited).toEqual(['github'])
    expect(after.reads[prKey(gh)]).toEqual({
      detail: null,
      failure: { provider: 'github', kind: 'rate-limited', resetAt: 1000 }
    })
  })
})

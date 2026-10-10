import { describe, expect, it } from 'vitest'
import {
  reviewerStates,
  timeline,
  toThreadViews,
  type GqlIssueComment,
  type GqlReview,
  type GqlReviewThread
} from './github-pr-model'

// Every name here is fictitious: this repository is public (spec privacy guardrail).

/** A review thread as GitHub's GraphQL reports it, current and active, on one changed line. */
function thread(overrides: Partial<GqlReviewThread> = {}): GqlReviewThread {
  return {
    id: 'PRRT_thread1',
    path: 'src/a.ts',
    line: 5,
    startLine: 5,
    originalLine: 5,
    originalStartLine: 5,
    diffSide: 'RIGHT',
    subjectType: 'LINE',
    isResolved: false,
    isOutdated: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    viewerCanUnresolve: false,
    comments: [
      {
        databaseId: 1001,
        author: { login: 'reviewer-one' },
        body: 'Why this?',
        createdAt: '2026-10-01T10:00:00Z'
      }
    ],
    ...overrides
  }
}

describe('toThreadViews', () => {
  // S4: GitHub reports `line: 1` on a file-level thread; FILE is checked first.
  it('lists a file-level thread as general with its path, whatever line GitHub reports', () => {
    const [view] = toThreadViews([
      thread({ subjectType: 'FILE', path: 'assets/logo.bin', line: 1, startLine: 1 })
    ])

    expect(view.place).toEqual({ kind: 'general', path: 'assets/logo.bin' })
  })

  // S5: an outdated thread has `line` and `startLine` null and keeps `originalLine`.
  it('lists an outdated thread as outdated on its original line', () => {
    const [view] = toThreadViews([
      thread({
        isOutdated: true,
        line: null,
        startLine: null,
        originalLine: 30,
        originalStartLine: 5
      })
    ])

    expect(view.place).toEqual({ kind: 'outdated', path: 'src/a.ts', line: 30 })
  })

  // S4: a one-line thread reports `startLine` equal to `line`.
  it('places a thread on its lines on the right side, one line or a range', () => {
    const [oneLine, range] = toThreadViews([
      thread({ startLine: 5, line: 5 }),
      thread({ id: 'PRRT_thread2', startLine: 3, line: 7 })
    ])

    expect(oneLine.place).toEqual({
      kind: 'placed',
      path: 'src/a.ts',
      side: 'right',
      startLine: 5,
      endLine: 5
    })
    expect(range.place).toEqual({
      kind: 'placed',
      path: 'src/a.ts',
      side: 'right',
      startLine: 3,
      endLine: 7
    })
  })

  it('reads a resolved thread as resolved and a LEFT thread on the left side', () => {
    const [resolvedLeft, active] = toThreadViews([
      thread({ isResolved: true, diffSide: 'LEFT', startLine: 4, line: 4 }),
      thread({ id: 'PRRT_thread2' })
    ])

    expect(resolvedLeft.resolution).toBe('resolved')
    expect(resolvedLeft.place).toEqual({
      kind: 'placed',
      path: 'src/a.ts',
      side: 'left',
      startLine: 4,
      endLine: 4
    })
    expect(active.resolution).toBe('active')
  })

  it("carries the viewer's permissions, the node id, the root comment and every comment", () => {
    const [view] = toThreadViews([
      thread({
        id: 'PRRT_kwDOtest',
        viewerCanReply: false,
        viewerCanResolve: false,
        viewerCanUnresolve: true,
        comments: [
          {
            databaseId: 2001,
            author: { login: 'reviewer-one' },
            body: 'First',
            createdAt: '2026-10-01T10:00:00Z'
          },
          { databaseId: 2005, author: null, body: 'Reply', createdAt: '2026-10-01T11:30:00Z' }
        ]
      })
    ])

    expect(view.id).toBe('PRRT_kwDOtest')
    expect(view.can).toEqual({ reply: false, resolve: false, reopen: true })
    expect(view.rootCommentId).toBe(2001)
    expect(view.providerStatus).toBeUndefined()
    expect(view.comments).toEqual([
      {
        id: 2001,
        author: 'reviewer-one',
        content: 'First',
        at: Date.parse('2026-10-01T10:00:00Z')
      },
      // GitHub reports a deleted account as no author; it shows as `ghost`, as on github.com.
      { id: 2005, author: 'ghost', content: 'Reply', at: Date.parse('2026-10-01T11:30:00Z') }
    ])
  })
})

/** A review as GitHub's GraphQL reports it. */
function review(login: string, state: GqlReview['state'], at: string | null, body = ''): GqlReview {
  return { author: { login }, state, body, submittedAt: at }
}

describe('reviewerStates', () => {
  it("keeps each reviewer's latest review, in GitHub's states", () => {
    const reviewers = reviewerStates(
      [
        review('reviewer-one', 'CHANGES_REQUESTED', '2026-10-01T10:00:00Z'),
        review('reviewer-two', 'COMMENTED', '2026-10-01T09:00:00Z'),
        review('reviewer-one', 'APPROVED', '2026-10-02T10:00:00Z'),
        review('reviewer-three', 'DISMISSED', '2026-10-01T08:00:00Z'),
        // Listed last but submitted first: the date decides, not the order.
        review('reviewer-two', 'APPROVED', '2026-09-30T09:00:00Z')
      ],
      []
    )

    expect(reviewers).toEqual([
      { name: 'reviewer-one', state: 'approved', isGroup: false, isRequired: false },
      { name: 'reviewer-two', state: 'commented', isGroup: false, isRequired: false },
      { name: 'reviewer-three', state: 'dismissed', isGroup: false, isRequired: false }
    ])
  })

  it('leaves out a pending review and lists requested people and teams without a review as no vote', () => {
    const reviewers = reviewerStates(
      [
        review('contoso', 'PENDING', null),
        review('reviewer-one', 'CHANGES_REQUESTED', '2026-10-01T10:00:00Z')
      ],
      [
        { requestedReviewer: { __typename: 'Team', name: 'widget-maintainers' } },
        { requestedReviewer: { __typename: 'User', login: 'reviewer-two' } },
        // Re-requested after reviewing: listed once, with the review.
        { requestedReviewer: { __typename: 'User', login: 'reviewer-one' } }
      ]
    )

    expect(reviewers).toEqual([
      { name: 'reviewer-one', state: 'changes-requested', isGroup: false, isRequired: false },
      { name: 'widget-maintainers', state: 'no-vote', isGroup: true, isRequired: false },
      { name: 'reviewer-two', state: 'no-vote', isGroup: false, isRequired: false }
    ])
  })
})

function comment(login: string, at: string, body: string): GqlIssueComment {
  return { author: { login }, body, createdAt: at }
}

describe('timeline', () => {
  it('merges review bodies and PR comments in time order, each review with its state', () => {
    const entries = timeline(
      [
        review('reviewer-one', 'CHANGES_REQUESTED', '2026-10-01T12:00:00Z', 'Please split this.'),
        review('reviewer-two', 'APPROVED', '2026-10-03T09:00:00Z', 'Ship it.'),
        // Unsent: never shown as if it had been posted.
        review('contoso', 'PENDING', null, 'Draft I have not sent')
      ],
      [
        comment('contoso', '2026-10-02T08:00:00Z', 'Split in two commits.'),
        comment('reviewer-two', '2026-10-01T09:00:00Z', 'Taking a look.')
      ]
    )

    expect(entries).toEqual([
      { author: 'reviewer-two', at: Date.parse('2026-10-01T09:00:00Z'), content: 'Taking a look.' },
      {
        author: 'reviewer-one',
        at: Date.parse('2026-10-01T12:00:00Z'),
        content: 'Please split this.',
        reviewState: 'changes-requested'
      },
      {
        author: 'contoso',
        at: Date.parse('2026-10-02T08:00:00Z'),
        content: 'Split in two commits.'
      },
      {
        author: 'reviewer-two',
        at: Date.parse('2026-10-03T09:00:00Z'),
        content: 'Ship it.',
        reviewState: 'approved'
      }
    ])
  })

  // S2: every comment posted outside a review creates an empty COMMENTED
  // review; an approval with no text shows its state among the reviewers only.
  it('adds no entry for a review with an empty body', () => {
    const entries = timeline(
      [
        review('reviewer-one', 'COMMENTED', '2026-10-01T10:00:00Z', ''),
        review('reviewer-two', 'APPROVED', '2026-10-01T11:00:00Z', '  \n'),
        review('reviewer-three', 'COMMENTED', '2026-10-01T12:00:00Z', 'One note.')
      ],
      []
    )

    expect(entries).toEqual([
      {
        author: 'reviewer-three',
        at: Date.parse('2026-10-01T12:00:00Z'),
        content: 'One note.',
        reviewState: 'commented'
      }
    ])
  })
})

import type {
  PrComment,
  PrThreadPlace,
  PrThreadView,
  PrTimelineEntry,
  Reviewer,
  ReviewerState
} from '../shared/files'

/**
 * GitHub's GraphQL shapes turned into the app's pull request model (F5).
 * Pure: the client fetches and pages every connection, this decides, so every
 * rule here is unit-tested against fixtures shaped like what T1 measured
 * (design § Spike Findings).
 */

/** An account; GitHub reports a deleted one as null. */
export interface GqlActor {
  login: string
}

/** One comment of a review thread, as much of it as the app reads. */
export interface GqlReviewComment {
  databaseId: number
  author: GqlActor | null
  body: string
  /** ISO 8601. */
  createdAt: string
}

/** One review thread, its `comments` connection already paged to the end. */
export interface GqlReviewThread {
  /** The node id resolve and unresolve take. */
  id: string
  path: string
  /** Null when the thread is outdated (S5). */
  line: number | null
  /** Equal to `line` for a one-line thread (S4); null when outdated (S5). */
  startLine: number | null
  originalLine: number | null
  originalStartLine: number | null
  diffSide: 'LEFT' | 'RIGHT'
  /** `FILE` threads still report `line: 1` (S4). */
  subjectType: 'LINE' | 'FILE'
  isResolved: boolean
  isOutdated: boolean
  viewerCanReply: boolean
  viewerCanResolve: boolean
  viewerCanUnresolve: boolean
  comments: GqlReviewComment[]
}

export type GqlReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING'

/** A review; `submittedAt` is null while it is pending. */
export interface GqlReview {
  author: GqlActor | null
  state: GqlReviewState
  body: string
  submittedAt: string | null
}

/** One entry of `reviewRequests`: a person, a team, or nothing when it was deleted. */
export interface GqlReviewRequest {
  requestedReviewer:
    | { __typename: 'User' | 'Bot' | 'Mannequin'; login: string }
    | { __typename: 'Team'; name: string }
    | null
}

/** A PR comment (an issue comment on the pull request). */
export interface GqlIssueComment {
  author: GqlActor | null
  body: string
  createdAt: string
}

/** The name github.com shows for a deleted account. */
const GHOST = 'ghost'

const REVIEW_STATES: Record<Exclude<GqlReviewState, 'PENDING'>, ReviewerState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed'
}

/**
 * Review threads as the views draw them (FPRG-13, 14, 17, 18). The place is
 * decided in this order: a `FILE` thread is general with its path, whatever
 * line GitHub reports (S4); an outdated one — or one with no line left — is
 * listed on its original line (S5); any other is placed from `startLine` to
 * `line` on its side.
 */
export function toThreadViews(threads: GqlReviewThread[]): PrThreadView[] {
  return threads.map((thread) => ({
    id: thread.id,
    rootCommentId: thread.comments[0]?.databaseId ?? 0,
    resolution: thread.isResolved ? 'resolved' : 'active',
    can: {
      reply: thread.viewerCanReply,
      resolve: thread.viewerCanResolve,
      reopen: thread.viewerCanUnresolve
    },
    comments: thread.comments.map(
      (c): PrComment => ({
        id: c.databaseId,
        author: c.author?.login ?? GHOST,
        content: c.body,
        at: Date.parse(c.createdAt)
      })
    ),
    place: placeOf(thread)
  }))
}

function placeOf(thread: GqlReviewThread): PrThreadPlace {
  if (thread.subjectType === 'FILE') return { kind: 'general', path: thread.path }
  if (thread.isOutdated || thread.line === null) {
    return {
      kind: 'outdated',
      path: thread.path,
      line: thread.originalLine ?? thread.originalStartLine ?? 1
    }
  }
  return {
    kind: 'placed',
    path: thread.path,
    side: thread.diffSide === 'LEFT' ? 'left' : 'right',
    startLine: thread.startLine ?? thread.line,
    endLine: thread.line
  }
}

/**
 * Each reviewer's latest submitted review, in the neutral states (FPRG-09),
 * then every requested person or team with no review as `no-vote`. A pending
 * review is the viewer's own unsent draft and counts for nothing.
 */
export function reviewerStates(reviews: GqlReview[], requests: GqlReviewRequest[]): Reviewer[] {
  const latest = new Map<string, { state: ReviewerState; at: number }>()
  for (const r of reviews) {
    if (r.state === 'PENDING' || r.submittedAt === null) continue
    const name = r.author?.login ?? GHOST
    const at = Date.parse(r.submittedAt)
    const known = latest.get(name)
    if (known && known.at > at) continue
    latest.set(name, { state: REVIEW_STATES[r.state], at })
  }
  const reviewers: Reviewer[] = [...latest].map(([name, { state }]) => ({
    name,
    state,
    isGroup: false,
    isRequired: false
  }))
  for (const { requestedReviewer: who } of requests) {
    if (who === null) continue
    const isGroup = who.__typename === 'Team'
    const name = 'login' in who ? who.login : who.name
    if (!isGroup && latest.has(name)) continue
    reviewers.push({ name, state: 'no-vote', isGroup, isRequired: false })
  }
  return reviewers
}

/**
 * Review bodies and PR comments in time order (FPRG-10, D4). A review with an
 * empty body adds nothing: every comment posted outside a review creates one
 * (S2), and an approval with no text shows only as its reviewer's state. A
 * pending review has not been posted and is left out.
 */
export function timeline(reviews: GqlReview[], comments: GqlIssueComment[]): PrTimelineEntry[] {
  const entries: PrTimelineEntry[] = []
  for (const r of reviews) {
    if (r.state === 'PENDING' || r.submittedAt === null || r.body.trim() === '') continue
    entries.push({
      author: r.author?.login ?? GHOST,
      at: Date.parse(r.submittedAt),
      content: r.body,
      reviewState: REVIEW_STATES[r.state]
    })
  }
  for (const c of comments) {
    entries.push({ author: c.author?.login ?? GHOST, at: Date.parse(c.createdAt), content: c.body })
  }
  return entries.sort((a, b) => a.at - b.at)
}

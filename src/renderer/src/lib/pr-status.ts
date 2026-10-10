import type { Reviewer, ReviewerState } from '../../../shared/files'

/**
 * Pure decisions behind the status bar's pull request chip (F6): the review
 * mark a pull request earns and the lines its tooltip lists.
 */

/** How each reviewer state reads, in the Overview and in the chip's tooltip. */
export const REVIEWER_STATES: Record<ReviewerState, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved with suggestions',
  'no-vote': 'No vote',
  'waiting-for-author': 'Waiting for author',
  rejected: 'Rejected',
  'changes-requested': 'Changes requested',
  commented: 'Commented',
  dismissed: 'Dismissed'
}

/** The chip's review mark: ✕, ⏸ and ✓ (SPRL-04..06). */
export type ReviewMark = 'rejected' | 'changes' | 'approved'

/** What each state adds to the mark; a comment, a dismissal or no vote adds nothing (SPRL-07). */
const MARK_OF: Record<ReviewerState, ReviewMark | null> = {
  rejected: 'rejected',
  'waiting-for-author': 'changes',
  'changes-requested': 'changes',
  approved: 'approved',
  'approved-with-suggestions': 'approved',
  'no-vote': null,
  commented: null,
  dismissed: null
}

/** Worst first. */
const MARK_ORDER: readonly ReviewMark[] = ['rejected', 'changes', 'approved']

/**
 * The worst mark any reviewer earns (SPRL-04..07): a single rejection is never
 * hidden behind an approval. A group or a required reviewer weighs like
 * anyone else — the required-reviewer policy is out of scope.
 */
export function reviewMark(reviewers: Reviewer[]): ReviewMark | null {
  const marks = new Set(reviewers.map((reviewer) => MARK_OF[reviewer.state]))
  return MARK_ORDER.find((mark) => marks.has(mark)) ?? null
}

/** One tooltip line per reviewer, in the provider's order (SPRL-08). */
export function reviewLines(reviewers: Reviewer[]): string[] {
  return reviewers.map((reviewer) => `${reviewer.name}: ${REVIEWER_STATES[reviewer.state]}`)
}

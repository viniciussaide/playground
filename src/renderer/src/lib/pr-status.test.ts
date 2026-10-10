import { describe, expect, it } from 'vitest'
import type { Reviewer, ReviewerState } from '../../../shared/files'
import { reviewLines, reviewMark } from './pr-status'

function reviewer(
  name: string,
  state: ReviewerState,
  extra: Partial<Pick<Reviewer, 'isGroup' | 'isRequired'>> = {}
): Reviewer {
  return { name, state, isGroup: false, isRequired: false, ...extra }
}

describe('reviewMark', () => {
  it('marks a rejection, whatever else the reviewers said (SPRL-04)', () => {
    // Azure DevOps-shaped: votes -10, 10, -5.
    expect(
      reviewMark([
        reviewer('Ana', 'approved'),
        reviewer('Bruno', 'rejected'),
        reviewer('Carla', 'waiting-for-author')
      ])
    ).toBe('rejected')
  })

  it('marks waiting for the author when nobody rejected (SPRL-05)', () => {
    expect(reviewMark([reviewer('Ana', 'approved'), reviewer('Bruno', 'waiting-for-author')])).toBe(
      'changes'
    )
  })

  it("marks GitHub's requested changes like waiting for the author (SPRL-05)", () => {
    expect(
      reviewMark([reviewer('octo-a', 'approved'), reviewer('octo-b', 'changes-requested')])
    ).toBe('changes')
  })

  it('marks an approval when nobody rejected or asked for changes (SPRL-06)', () => {
    expect(reviewMark([reviewer('Ana', 'approved'), reviewer('Bruno', 'no-vote')])).toBe('approved')
  })

  it('counts an approval with suggestions as an approval (SPRL-06)', () => {
    expect(reviewMark([reviewer('Ana', 'approved-with-suggestions')])).toBe('approved')
  })

  it('marks nothing when no reviewer voted (SPRL-07)', () => {
    expect(reviewMark([reviewer('Ana', 'no-vote'), reviewer('Bruno', 'no-vote')])).toBeNull()
    expect(reviewMark([])).toBeNull()
  })

  it("marks nothing for GitHub's comments and dismissed reviews (SPRL-07)", () => {
    expect(
      reviewMark([reviewer('octo-a', 'commented'), reviewer('octo-b', 'dismissed')])
    ).toBeNull()
  })

  it('weighs a group and a required reviewer like anyone else (SPRL-04..06)', () => {
    expect(
      reviewMark([
        reviewer('Platform Team', 'approved', { isGroup: true, isRequired: true }),
        reviewer('Ana', 'rejected')
      ])
    ).toBe('rejected')
    expect(
      reviewMark([
        reviewer('Platform Team', 'no-vote', { isGroup: true, isRequired: true }),
        reviewer('Ana', 'approved')
      ])
    ).toBe('approved')
  })
})

describe('reviewLines', () => {
  it('lists every reviewer with their state, in order (SPRL-08)', () => {
    expect(
      reviewLines([
        reviewer('Ana', 'approved-with-suggestions'),
        reviewer('Platform Team', 'no-vote', { isGroup: true }),
        reviewer('octo-b', 'changes-requested'),
        reviewer('Bruno', 'waiting-for-author')
      ])
    ).toEqual([
      'Ana: Approved with suggestions',
      'Platform Team: No vote',
      'octo-b: Changes requested',
      'Bruno: Waiting for author'
    ])
  })
})

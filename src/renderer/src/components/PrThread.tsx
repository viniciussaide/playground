import { useState } from 'react'
import type { JSX } from 'react'
import type {
  AdoThreadStatus,
  PrProvider,
  PrThreadView,
  ThreadStateIntent,
  WriteResult
} from '../../../shared/files'
import { OFFERED_STATUSES, statusLabel } from '../lib/pr-view'
import { relativeTime } from '../lib/relative-time'
import { resolutionOf } from '../lib/use-pull-request'
import { useSharedNow } from '../lib/shared-tick'
import { CommentComposer, MarkdownBody } from './CommentComposer'
import { Icon } from './Icon'
import './PrThread.css'

/** Relative dates move by the minute; one shared tick re-renders them. */
const DATE_TICK_MS = 60_000

type SettableStatus = Exclude<AdoThreadStatus, 'unknown'>

/**
 * What a provider's state control gets: the thread, a way to change its state
 * in the provider's own terms, and why it may not, when it may not (FPRG-18).
 */
interface StatusControlProps {
  thread: PrThreadView
  busy: boolean
  /** Set when the viewer may not change this thread's state; the control is then disabled. */
  deniedReason: string | null
  onSetState: (intent: ThreadStateIntent) => void
}

/**
 * Azure DevOps' selector over its own thread statuses (FPRA-26). A thread read
 * with a status the app does not know shows it, and offers the known ones.
 */
function AdoStatusSelect({
  thread,
  busy,
  deniedReason,
  onSetState
}: StatusControlProps): JSX.Element {
  const status = thread.providerStatus ?? 'unknown'
  return (
    <select
      className="pr-thread-status"
      value={status}
      disabled={busy || deniedReason !== null}
      title={deniedReason ?? 'Thread status'}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) =>
        onSetState({ provider: 'azure-devops', status: event.target.value as SettableStatus })
      }
    >
      {status === 'unknown' && (
        <option value="unknown" disabled>
          {statusLabel('unknown')}
        </option>
      )}
      {OFFERED_STATUSES.map((offered) => (
        <option key={offered} value={offered}>
          {statusLabel(offered)}
        </option>
      ))}
    </select>
  )
}

/**
 * GitHub's Resolve / Reopen toggle (FPRG-17): a GitHub thread has no statuses,
 * only resolved or not, so an active thread offers Resolve and a resolved one
 * Reopen. When the viewer may not, the toggle is disabled and says why
 * (FPRG-18); the reason is the permission that applies to the thread's state
 * (T1, S4).
 */
function GitHubResolveToggle({
  thread,
  busy,
  deniedReason,
  onSetState
}: StatusControlProps): JSX.Element {
  const open = thread.resolution === 'active'
  return (
    <>
      {deniedReason && <span className="pr-thread-denied">{deniedReason}</span>}
      <button
        type="button"
        className="pr-thread-resolve"
        data-action={open ? 'resolve' : 'reopen'}
        disabled={busy || deniedReason !== null}
        title={deniedReason ?? (open ? 'Resolve this thread' : 'Reopen this thread')}
        onClick={(event) => {
          event.stopPropagation()
          onSetState({ provider: 'github', resolved: open })
        }}
      >
        {open ? 'Resolve' : 'Reopen'}
      </button>
    </>
  )
}

/**
 * The status control each provider offers, chosen by the thread's provider:
 * Azure DevOps' selector (FPRA-26) and GitHub's Resolve / Reopen toggle
 * (FPRG-17). The thread around it stays as it is.
 */
const STATUS_CONTROLS: Record<PrProvider, (props: StatusControlProps) => JSX.Element> = {
  'azure-devops': AdoStatusSelect,
  github: GitHubResolveToggle
}

interface PrThreadProps {
  thread: PrThreadView
  provider: PrProvider
  /** Where the thread sits, for the Overview's list — `file:line` or general (FPRA-11). */
  location?: string
  /** Opens the thread where it sits (FPRA-12); the location becomes a button when present. */
  onActivate?: () => void
  /** A reply under the thread's root comment (FPRA-25). Called only from the composer. */
  onReply: (content: string) => Promise<WriteResult>
  /** A new state, in the provider's terms (FPRA-26, FPRG-17). Called only from the state control. */
  onSetState: (intent: ThreadStateIntent) => Promise<WriteResult>
  onOpenLink: (href: string) => void
}

/**
 * Why the viewer may not reply to, or change the state of, this thread
 * (FPRG-18); null where they may. A thread with no `can` — Azure DevOps — allows
 * everything. The state control reads the permission that applies to the
 * thread's state: resolving an open thread, reopening a resolved one (T1, S4).
 */
function deniedReasons(thread: PrThreadView): { reply: string | null; state: string | null } {
  const can = thread.can
  if (can === undefined) return { reply: null, state: null }
  const open = thread.resolution === 'active'
  return {
    reply: can.reply ? null : 'You do not have permission to reply to this thread.',
    state: (open ? can.resolve : can.reopen)
      ? null
      : `You do not have permission to ${open ? 'resolve' : 'reopen'} this thread.`
  }
}

/**
 * One review thread (FPRA-20/21/25/26): its comments, each with its author and
 * relative date and rendered inertly; Reply through the composer; and the
 * provider's state control. An action the viewer may not take is disabled
 * with the reason (FPRG-18).
 *
 * An active thread opens expanded and a resolved one collapsed to its status
 * and author, expandable (FPRA-20). Changing the state as the reader chose
 * moves the thread with it: a change that leaves it open — on Azure DevOps
 * Active or Pending — reopens and expands it, one that resolves it collapses
 * it (FPRA-26).
 */
export function PrThread({
  thread,
  provider,
  location,
  onActivate,
  onReply,
  onSetState,
  onOpenLink
}: PrThreadProps): JSX.Element {
  const now = useSharedNow(DATE_TICK_MS)
  const [expanded, setExpanded] = useState(thread.resolution === 'active')
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const first = thread.comments[0]
  const Control = STATUS_CONTROLS[provider]
  const denied = deniedReasons(thread)

  const setState = (intent: ThreadStateIntent): void => {
    setBusy(true)
    setStatusError(null)
    void onSetState(intent).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setStatusError(result.message)
        return
      }
      // FPRA-26: a reopened thread is seen open, a resolved one collapses.
      setExpanded(resolutionOf(intent) === 'active')
    })
  }

  const reply = (content: string): Promise<WriteResult> =>
    onReply(content).then((result) => {
      if (result.ok) setReplying(false)
      return result
    })

  return (
    <div
      className={`pr-thread ${thread.resolution}${expanded ? ' expanded' : ''}`}
      data-thread-id={thread.id}
    >
      <div className="pr-thread-head">
        <button
          type="button"
          className="pr-thread-toggle"
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className={`pr-thread-chevron${expanded ? ' open' : ''}`}>
            <Icon name="chevron-down" size={13} />
          </span>
          <span className="pr-thread-author">{first?.author ?? 'Unknown'}</span>
          {!expanded && first && <span className="pr-thread-snippet">{first.content}</span>}
        </button>
        {location &&
          (onActivate ? (
            <button
              type="button"
              className="pr-thread-location link"
              title={`Open ${location}`}
              onClick={onActivate}
            >
              {location}
            </button>
          ) : (
            <span className="pr-thread-location">{location}</span>
          ))}
        <Control thread={thread} busy={busy} deniedReason={denied.state} onSetState={setState} />
      </div>
      {statusError && (
        <div className="pr-thread-error" role="alert">
          {statusError}
        </div>
      )}
      {expanded && (
        <div className="pr-thread-body">
          {thread.comments.map((comment) => (
            <div key={comment.id} className="pr-thread-comment" data-comment-id={comment.id}>
              <div className="pr-thread-meta">
                <span className="pr-thread-meta-author">{comment.author}</span>
                <span className="pr-thread-meta-date" title={new Date(comment.at).toLocaleString()}>
                  {relativeTime(comment.at, now)}
                </span>
              </div>
              <MarkdownBody source={comment.content} onOpenLink={onOpenLink} />
            </div>
          ))}
          {replying ? (
            <CommentComposer
              postLabel="Reply"
              placeholder="Write a reply… Markdown is supported."
              autoFocus
              onPost={reply}
              onCancel={() => setReplying(false)}
              onOpenLink={onOpenLink}
            />
          ) : (
            <>
              <button
                type="button"
                className="pr-thread-reply"
                disabled={denied.reply !== null}
                title={denied.reply ?? undefined}
                onClick={() => setReplying(true)}
              >
                Reply
              </button>
              {denied.reply && <span className="pr-thread-denied">{denied.reply}</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

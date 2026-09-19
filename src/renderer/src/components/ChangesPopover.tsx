import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ChangedFile, ChangeStatus } from '../../../shared/worktrees'
import { api } from '../lib/api'
import './ChangesPopover.css'

interface ChangesPopoverProps {
  worktreePath: string
  onClose: () => void
}

/**
 * The force-remove dialog's labels for the five porcelain-derived statuses.
 * Repeated rather than imported: `RemoveWorktreeConfirm` keeps its table private.
 */
const STATUS_LABEL: Record<ChangeStatus, string> = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked'
}

/**
 * The changed-files popover (STBR-30): every changed path with its status,
 * listed once on open — the counter itself reads the tree snapshot. Rows are
 * inert; per-file actions belong to the next feature (STBR-32). Dismissed by
 * Escape or a click outside, like the sync popover.
 */
export function ChangesPopover({ worktreePath, onClose }: ChangesPopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [files, setFiles] = useState<ChangedFile[] | null>(null)

  // Once per open: the popover mounts on open and unmounts on close.
  useEffect(() => {
    let live = true
    api
      .invoke('worktrees:changes', { worktreePath })
      .then((next) => {
        if (live) setFiles(next)
      })
      .catch(console.error)
    return () => {
      live = false
    }
  }, [worktreePath])

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="changes-pop" ref={ref}>
      <div className="section-label">Changed files</div>
      {files === null ? (
        <div className="changes-pop-empty">Loading…</div>
      ) : files.length === 0 ? (
        // STBR-31. `changedFilesOf` also answers [] when git fails, so this is
        // what the list says, not proof of a clean tree (design, Risks).
        <div className="changes-pop-empty">No changes.</div>
      ) : (
        <div className="changes-pop-list">
          {files.map((file) => (
            <div key={file.path} className="changes-pop-row">
              <span className={`changes-pop-pill ${file.status}`}>{STATUS_LABEL[file.status]}</span>
              <span className="changes-pop-path" title={file.path}>
                {file.path}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

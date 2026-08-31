import { useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { RAIL_WIDTH, clampPaneWidth, type PaneBounds } from '../lib/pane-layout'
import { Icon } from './Icon'
import './ResizablePane.css'

interface ResizablePaneProps {
  /** Which edge carries the drag handle: `right` for a left pane, `left` for a right pane. */
  side: 'left' | 'right'
  /** Current expanded width in px (persisted value, resolved upstream). */
  width: number
  collapsed: boolean
  bounds: PaneBounds
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
  /** aria-label/title for the collapsed rail's expand button. */
  railLabel: string
  children: ReactNode
}

/**
 * Pane wrapper with a draggable edge handle (clamped to `bounds`), a header
 * collapse toggle wired by the owner via `onToggleCollapsed`, and a 36px
 * collapsed rail that restores the previous width on expand (PANE-02..08).
 */
export function ResizablePane({
  side,
  width,
  collapsed,
  bounds,
  onWidthChange,
  onToggleCollapsed,
  railLabel,
  children
}: ResizablePaneProps): JSX.Element {
  const [dragging, setDragging] = useState(false)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)
    const onMove = (ev: PointerEvent): void => {
      if (!handle.hasPointerCapture(ev.pointerId)) return
      const delta = side === 'right' ? ev.clientX - startX : startX - ev.clientX
      onWidthChange(clampPaneWidth(startWidth + delta, bounds))
    }
    const onUp = (ev: PointerEvent): void => {
      handle.releasePointerCapture(ev.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      setDragging(false)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={`resizable-pane pane-${side}${collapsed ? ' collapsed' : ''}${dragging ? ' dragging' : ''}`}
      style={{
        flexBasis: collapsed ? RAIL_WIDTH : width,
        minWidth: collapsed ? RAIL_WIDTH : bounds.min,
        maxWidth: collapsed ? RAIL_WIDTH : width
      }}
    >
      {collapsed ? (
        <button
          type="button"
          className="pane-rail"
          aria-label={railLabel}
          title={railLabel}
          onClick={onToggleCollapsed}
        >
          <Icon name="chevron-down" size={16} />
        </button>
      ) : (
        <>
          {children}
          <div
            className="pane-handle"
            aria-hidden="true"
            onPointerDown={startDrag}
            onDoubleClick={onToggleCollapsed}
          />
        </>
      )}
    </div>
  )
}

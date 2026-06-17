import { useCallback, useEffect, useRef, useState } from 'react'
import { useFloorPlan } from '../context/FloorPlanContext'

const NOTES_OPEN_KEY = 'floor-planner-notes-open'
const NOTES_WIDTH_KEY = 'floor-planner-notes-width'
const NOTES_TAB_KEY = 'floor-planner-notes-tab'
const DEFAULT_WIDTH = 280
const MIN_WIDTH = 200
const COLLAPSE_WIDTH = 120
const MAX_WIDTH_RATIO = 0.55
const DRAG_CLICK_THRESHOLD = 4

type NotesTab = 'project' | 'masternote'
type DragState =
  | { mode: 'open'; startX: number }
  | { mode: 'resize'; startX: number; startWidth: number }

function maxWidth() {
  return Math.max(MIN_WIDTH, Math.floor(window.innerWidth * MAX_WIDTH_RATIO))
}

function clampWidth(width: number) {
  return Math.min(maxWidth(), Math.max(MIN_WIDTH, width))
}

function readStoredWidth() {
  const stored = localStorage.getItem(NOTES_WIDTH_KEY)
  const parsed = stored ? Number(stored) : DEFAULT_WIDTH
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH
  return clampWidth(parsed)
}

function readStoredTab(): NotesTab {
  const stored = localStorage.getItem(NOTES_TAB_KEY)
  return stored === 'masternote' ? 'masternote' : 'project'
}

function NotesIcon() {
  return (
    <svg
      className="project-notes-fab-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export function ProjectNotesPanel() {
  const { state, setPlanNotes, masterNote, setMasterNote } = useFloorPlan()
  const [open, setOpen] = useState(() => localStorage.getItem(NOTES_OPEN_KEY) === '1')
  const [width, setWidth] = useState(readStoredWidth)
  const [tab, setTab] = useState<NotesTab>(readStoredTab)
  const [resizing, setResizing] = useState(false)
  const [collapseHint, setCollapseHint] = useState(false)
  const [fabDragging, setFabDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(NOTES_OPEN_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    if (width >= MIN_WIDTH) {
      localStorage.setItem(NOTES_WIDTH_KEY, String(width))
    }
  }, [width])

  useEffect(() => {
    localStorage.setItem(NOTES_TAB_KEY, tab)
  }, [tab])

  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const endResize = useCallback(() => {
    dragRef.current = null
    movedRef.current = false
    setResizing(false)
    setCollapseHint(false)
    setFabDragging(false)
    document.body.classList.remove('project-notes-resizing')
  }, [])

  const beginResize = useCallback(() => {
    setResizing(true)
    document.body.classList.add('project-notes-resizing')
  }, [])

  const onFabPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { mode: 'open', startX: e.clientX }
    movedRef.current = false
    setFabDragging(true)
    setWidth(COLLAPSE_WIDTH)
    beginResize()
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [beginResize])

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      dragRef.current = { mode: 'resize', startX: e.clientX, startWidth: width }
      movedRef.current = false
      beginResize()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [width, beginResize],
  )

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    if (drag.mode === 'open') {
      const raw = drag.startX - e.clientX
      if (Math.abs(raw) > DRAG_CLICK_THRESHOLD) movedRef.current = true
      setCollapseHint(raw < COLLAPSE_WIDTH)
      setWidth(Math.min(maxWidth(), Math.max(COLLAPSE_WIDTH, raw)))
      return
    }

    const raw = drag.startWidth + drag.startX - e.clientX
    if (Math.abs(raw - drag.startWidth) > DRAG_CLICK_THRESHOLD) movedRef.current = true
    setCollapseHint(raw < COLLAPSE_WIDTH)
    setWidth(Math.min(maxWidth(), Math.max(COLLAPSE_WIDTH, raw)))
  }, [])

  const onDragPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      e.currentTarget.releasePointerCapture(e.pointerId)

      if (drag.mode === 'open') {
        const raw = drag.startX - e.clientX
        if (!movedRef.current) {
          setOpen(true)
          setWidth(readStoredWidth())
        } else if (raw < COLLAPSE_WIDTH) {
          setOpen(false)
          setWidth(readStoredWidth())
        } else {
          setOpen(true)
          setWidth(clampWidth(raw))
        }
      } else {
        const raw = drag.startWidth + drag.startX - e.clientX
        if (raw < COLLAPSE_WIDTH) {
          setWidth(drag.startWidth)
          setOpen(false)
        } else {
          setWidth(clampWidth(raw))
        }
      }

      endResize()
    },
    [endResize],
  )

  const showPanel = open || resizing
  const isMasterTab = tab === 'masternote'

  return (
    <div className="project-notes-root">
      <button
        type="button"
        className={`project-notes-fab${open && !fabDragging ? ' hidden' : ''}${fabDragging ? ' dragging' : ''}`}
        aria-label="Open notes"
        title="Notes — click or drag left to open"
        onPointerDown={onFabPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <NotesIcon />
      </button>

      {showPanel && (
        <aside
          className={`project-notes-panel${resizing ? ' resizing' : ''}${collapseHint ? ' collapse-hint' : ''}`}
          style={{ width }}
          aria-label="Notes"
        >
          <div
            className="project-notes-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize notes panel"
            onPointerDown={onResizeHandlePointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerUp}
            onPointerCancel={onDragPointerUp}
          />
          <header className="project-notes-header">
            <div className="project-notes-tabs" role="tablist" aria-label="Notes pages">
              <button
                type="button"
                role="tab"
                className={`project-notes-tab${!isMasterTab ? ' active' : ''}`}
                aria-selected={!isMasterTab}
                onClick={() => setTab('project')}
              >
                Project
              </button>
              <button
                type="button"
                role="tab"
                className={`project-notes-tab${isMasterTab ? ' active' : ''}`}
                aria-selected={isMasterTab}
                onClick={() => setTab('masternote')}
              >
                Master note
              </button>
            </div>
            <button
              type="button"
              className="project-notes-collapse"
              onClick={() => setOpen(false)}
              aria-label="Collapse notes"
              title="Collapse"
            >
              ›
            </button>
          </header>
          {isMasterTab ? (
            <textarea
              className="project-notes-input"
              value={masterNote}
              onChange={(e) => setMasterNote(e.target.value)}
              placeholder="Notes that apply to every project…"
              aria-label="Master note"
            />
          ) : (
            <textarea
              className="project-notes-input"
              value={state.plan.notes}
              onChange={(e) => setPlanNotes(e.target.value)}
              placeholder="Dimensions, materials, client requests…"
              aria-label="Project notes"
            />
          )}
        </aside>
      )}
    </div>
  )
}

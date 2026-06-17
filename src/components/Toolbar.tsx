import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFloorPlan } from '../context/FloorPlanContext'
import { exportPlanJson, importPlanJson } from '../utils/storage'
import type { Tool, ViewMode } from '../types/floorPlan'
import { workspaceCenter, WORKSPACE_SIZE } from '../utils/workspace'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Drag corners or walls · Delete key removes selected wall or room' },
  { id: 'wall', label: 'Wall', hint: 'Click two points to place a wall · snaps to existing corners' },
  { id: 'room', label: 'Insert Room', hint: 'Click on the plan to place a room' },
  { id: 'delete', label: 'Delete', hint: 'Click a wall or room to delete it' },
]

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'plan2d', label: '2D Plan' },
  { id: 'view3d', label: '3D View' },
]

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const {
    state,
    planSummaries,
    activePlanId,
    setTool,
    setViewMode,
    setWalkMode,
    addRoom,
    createNewPlan,
    switchPlan,
    deleteCurrentPlan,
    setPlan,
  } = useFloorPlan()
  const { user, firebaseEnabled, signInWithGoogle, signOut, authError } = useAuth()

  const activeTool = TOOLS.find((t) => t.id === state.tool)

  const accountLabel = user
    ? (user.displayName ?? user.email ?? 'Account')
    : 'Account'

  useEffect(() => {
    if (!accountMenuOpen) return

    const onPointerDown = (e: PointerEvent) => {
      if (accountMenuRef.current?.contains(e.target as Node)) return
      setAccountMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [accountMenuOpen])

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <h1>Floor Planner</h1>
        <span className="toolbar-subtitle">Imperial · Single floor</span>
      </div>

      <div className="toolbar-group toolbar-plans">
        <select
          className="toolbar-plan-select"
          value={activePlanId ?? ''}
          onChange={(e) => switchPlan(e.target.value)}
          aria-label="Select floor plan"
        >
          {planSummaries.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => createNewPlan()} title="New home">
          + New
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => deleteCurrentPlan()}
          disabled={planSummaries.length <= 1}
          title="Delete this home"
        >
          Delete
        </button>
      </div>

      <div className="toolbar-group">
        <div className="toolbar-buttons">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={state.tool === tool.id ? 'active' : ''}
              onClick={() => setTool(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className="primary"
          onClick={() => addRoom(workspaceCenter(WORKSPACE_SIZE))}
        >
          + Insert Room
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">View</span>
        <div className="toolbar-buttons">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={state.viewMode === view.id ? 'active' : ''}
              onClick={() => setViewMode(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-group toolbar-actions">
        {firebaseEnabled && (
          <div className="toolbar-auth" ref={accountMenuRef}>
            <button
              type="button"
              className={`toolbar-account-btn${accountMenuOpen ? ' open' : ''}`}
              title={user?.email ?? 'Account menu'}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <span className="toolbar-account-label">{accountLabel}</span>
              <span className="toolbar-account-chevron" aria-hidden="true" />
            </button>
            {accountMenuOpen && (
              <div className="toolbar-account-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportPlanJson(state.plan)
                    setAccountMenuOpen(false)
                  }}
                >
                  Export
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    fileRef.current?.click()
                    setAccountMenuOpen(false)
                  }}
                >
                  Import
                </button>
                {user ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      signOut()
                      setAccountMenuOpen(false)
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      signInWithGoogle()
                      setAccountMenuOpen(false)
                    }}
                  >
                    Sign in with Google
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {!firebaseEnabled && (
          <>
            <button type="button" onClick={() => exportPlanJson(state.plan)}>
              Export
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Import
            </button>
          </>
        )}
        {state.viewMode === 'view3d' && (
          <button
            type="button"
            className={state.walkMode ? 'active walk-btn' : 'walk-btn'}
            onClick={() => setWalkMode(!state.walkMode)}
          >
            {state.walkMode ? 'Exit Walk' : 'Walk Through'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setPlan(await importPlanJson(file))
            e.target.value = ''
          }}
        />
      </div>

      {authError && <p className="toolbar-hint toolbar-error">{authError}</p>}
      {activeTool && <p className="toolbar-hint">{activeTool.hint}</p>}
      {state.walkMode && (
        <p className="toolbar-hint walk-hint">
          Click the 3D view · WASD to move · mouse to look · Esc to exit pointer lock
        </p>
      )}
    </header>
  )
}

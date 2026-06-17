import { useRef } from 'react'
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
  const {
    state,
    setTool,
    setViewMode,
    setWalkMode,
    addRoom,
    newPlan,
    setPlan,
  } = useFloorPlan()

  const activeTool = TOOLS.find((t) => t.id === state.tool)

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <h1>Floor Planner</h1>
        <span className="toolbar-subtitle">Imperial · Single floor</span>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Tools</span>
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
        {state.viewMode === 'view3d' && (
          <button
            type="button"
            className={state.walkMode ? 'active walk-btn' : 'walk-btn'}
            onClick={() => setWalkMode(!state.walkMode)}
          >
            {state.walkMode ? 'Exit Walk' : 'Walk Through'}
          </button>
        )}
        <button type="button" onClick={() => exportPlanJson(state.plan)}>
          Export
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button type="button" onClick={newPlan}>
          New Plan
        </button>
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

      {activeTool && <p className="toolbar-hint">{activeTool.hint}</p>}
      {state.walkMode && (
        <p className="toolbar-hint walk-hint">
          Click the 3D view · WASD to move · mouse to look · Esc to exit pointer lock
        </p>
      )}
    </header>
  )
}

import { useRef } from 'react'
import { useFloorPlan } from '../context/FloorPlanContext'
import { exportPlanJson, importPlanJson } from '../utils/storage'
import type { FurnitureType, Tool, ViewMode } from '../types/floorPlan'
import { FURNITURE_CATALOG } from '../types/floorPlan'
import { workspaceCenter, WORKSPACE_SIZE } from '../utils/workspace'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Click a room or wall · drag walls to resize · drag rooms to move' },
  { id: 'room', label: 'Insert Room', hint: 'Click on the plan to place a room' },
  { id: 'door', label: 'Door', hint: 'Click near a wall' },
  { id: 'window', label: 'Window', hint: 'Click near a wall' },
  { id: 'furniture', label: 'Furniture', hint: 'Pick item, click floor' },
  { id: 'staircase', label: 'Stairs', hint: 'Click to place (future floors)' },
  { id: 'delete', label: 'Delete', hint: 'Select item, press Delete' },
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
    setFurnitureType,
    setWalkMode,
    addRoom,
    deleteSelected,
    rotateSelected,
    newPlan,
    setPlan,
    selectedRoom,
    planWalls,
  } = useFloorPlan()

  const activeTool = TOOLS.find((t) => t.id === state.tool)
  const selectedWall = planWalls.some((w) => w.id === state.selectedId)
  const canRotate =
    state.selectedId &&
    !selectedRoom &&
    (state.plan.furniture.some((f) => f.id === state.selectedId) ||
      state.plan.staircases.some((s) => s.id === state.selectedId))

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

      {state.tool === 'furniture' && (
        <div className="toolbar-group">
          <span className="toolbar-label">Furniture</span>
          <select
            value={state.furnitureType}
            onChange={(e) => setFurnitureType(e.target.value as FurnitureType)}
          >
            {(Object.keys(FURNITURE_CATALOG) as FurnitureType[]).map((type) => (
              <option key={type} value={type}>
                {FURNITURE_CATALOG[type].label}
              </option>
            ))}
          </select>
        </div>
      )}

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
        {canRotate && (
          <button type="button" onClick={rotateSelected}>
            Rotate 90°
          </button>
        )}
        {state.selectedId && !selectedRoom && !selectedWall && (
          <button type="button" className="danger" onClick={deleteSelected}>
            Delete
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

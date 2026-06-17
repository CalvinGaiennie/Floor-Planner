import { useFloorPlan } from '../context/FloorPlanContext'

export function RoomBottomBar() {
  const { selectedRoom, updateRoom, deleteSelected, duplicateRoom } = useFloorPlan()

  if (!selectedRoom) {
    return (
      <footer className="room-bottom-bar room-bottom-bar-empty">
        <span className="room-bottom-bar-hint">
          Select a room or wall to edit its name, dimensions, and wall height.
        </span>
      </footer>
    )
  }

  const setNumber = (field: 'width' | 'depth' | 'wallHeight', raw: string) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value > 0) {
      updateRoom(selectedRoom.id, { [field]: value })
    }
  }

  return (
    <footer className="room-bottom-bar">
      <label className="bar-field-compact">
        <span>Name</span>
        <input
          type="text"
          value={selectedRoom.name}
          onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })}
        />
      </label>

      <label className="bar-field-compact">
        <span>W</span>
        <input
          type="number"
          min={4}
          max={80}
          step={0.5}
          value={selectedRoom.width}
          onChange={(e) => setNumber('width', e.target.value)}
          title="Width in feet"
        />
      </label>

      <label className="bar-field-compact">
        <span>D</span>
        <input
          type="number"
          min={4}
          max={80}
          step={0.5}
          value={selectedRoom.depth}
          onChange={(e) => setNumber('depth', e.target.value)}
          title="Depth in feet"
        />
      </label>

      <label className="bar-field-compact">
        <span>H</span>
        <input
          type="number"
          min={7}
          max={20}
          step={0.5}
          value={selectedRoom.wallHeight}
          onChange={(e) => setNumber('wallHeight', e.target.value)}
          title="Wall height in feet"
        />
      </label>

      <div className="room-bottom-bar-actions">
        <button type="button" onClick={() => duplicateRoom(selectedRoom.id)}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={deleteSelected}>
          Delete
        </button>
      </div>
    </footer>
  )
}

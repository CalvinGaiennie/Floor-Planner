import { useFloorPlan } from '../context/FloorPlanContext'
import { rotationDegrees } from '../utils/geometry'
import { roomBoundingSize } from '../utils/planModel'

function RotateButtons({ onRotate }: { onRotate: (direction: 'cw' | 'ccw') => void }) {
  return (
    <div className="room-bottom-bar-rotate">
      <button type="button" title="Rotate 90° counter-clockwise (Shift+R)" onClick={() => onRotate('ccw')}>
        ↺
      </button>
      <button type="button" title="Rotate 90° clockwise (R)" onClick={() => onRotate('cw')}>
        ↻
      </button>
    </div>
  )
}

export function RoomBottomBar() {
  const {
    selectedRoom,
    selectedFurniture,
    state,
    updateRoom,
    deleteSelected,
    duplicateRoom,
    rotateSelected,
  } = useFloorPlan()

  if (selectedFurniture) {
    return (
      <footer className="room-bottom-bar">
        <label className="bar-field-compact bar-field-readonly">
          <span>Name</span>
          <input type="text" readOnly value={selectedFurniture.label} />
        </label>

        <label className="bar-field-compact bar-field-readonly">
          <span>Rot</span>
          <input
            type="text"
            readOnly
            value={`${rotationDegrees(selectedFurniture.rotation)}°`}
            title="Rotation"
          />
        </label>

        <RotateButtons onRotate={rotateSelected} />

        <div className="room-bottom-bar-actions">
          <button type="button" className="danger" onClick={deleteSelected}>
            Delete
          </button>
        </div>
      </footer>
    )
  }

  if (!selectedRoom) {
    return (
      <footer className="room-bottom-bar room-bottom-bar-empty">
        <span className="room-bottom-bar-hint">
          Select a room, wall, or furniture. Press R to rotate 90°.
        </span>
      </footer>
    )
  }

  const { width, depth } = roomBoundingSize(state.plan, selectedRoom)

  const setNumber = (field: 'wallHeight', raw: string) => {
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

      <label className="bar-field-compact bar-field-readonly">
        <span>W</span>
        <input type="text" readOnly value={width.toFixed(1)} title="Bounding width (feet)" />
      </label>

      <label className="bar-field-compact bar-field-readonly">
        <span>D</span>
        <input type="text" readOnly value={depth.toFixed(1)} title="Bounding depth (feet)" />
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

      <RotateButtons onRotate={rotateSelected} />

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

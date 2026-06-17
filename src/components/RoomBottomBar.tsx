import { useFloorPlan } from '../context/FloorPlanContext'
import { rotationDegrees } from '../utils/geometry'
import { formatFeetInches } from '../utils/imperial'
import { doorStyleLabel, doorSwingLabel } from '../utils/doors'
import {
  canSplitRoom,
  canSplitWall,
  getRoom,
  getSharedWallRoomIds,
  getWall,
  isPlanWallId,
  isSharedRoomWall,
  resolveWall,
  roomBoundingSize,
} from '../utils/planModel'
import { wallLength } from '../utils/geometry'

function RotateButtons({
  onRotate,
  cwTitle,
  ccwTitle,
}: {
  onRotate: (direction: 'cw' | 'ccw') => void
  cwTitle?: string
  ccwTitle?: string
}) {
  return (
    <div className="room-bottom-bar-rotate">
      <button
        type="button"
        title={ccwTitle ?? 'Rotate 90° counter-clockwise (Shift+R)'}
        onClick={() => onRotate('ccw')}
      >
        ↺
      </button>
      <button
        type="button"
        title={cwTitle ?? 'Rotate 90° clockwise (R)'}
        onClick={() => onRotate('cw')}
      >
        ↻
      </button>
    </div>
  )
}

export function RoomBottomBar() {
  const {
    selectedRoom,
    selectedFurniture,
    selectedDoor,
    state,
    updateRoom,
    deleteSelected,
    duplicateRoom,
    duplicateFurniture,
    rotateSelected,
    splitRoomInPlan,
    splitSelectedWall,
  } = useFloorPlan()

  const selectedWallId =
    state.selectedId && isPlanWallId(state.plan, state.selectedId) ? state.selectedId : null
  const selectedWall = selectedWallId
    ? resolveWall(state.plan, getWall(state.plan, selectedWallId)!)
    : null
  const isSharedWall = selectedWallId ? isSharedRoomWall(state.plan, selectedWallId) : false
  const sharedRoomNames = selectedWallId
    ? getSharedWallRoomIds(state.plan, selectedWallId)
        .map((id) => getRoom(state.plan, id)?.name ?? 'Room')
        .join(' · ')
    : ''

  const canSplitSelectedWall = selectedWallId ? canSplitWall(state.plan, selectedWallId) : false

  if (selectedWall) {
    return (
      <footer className="room-bottom-bar">
        <label className="bar-field-compact bar-field-readonly">
          <span>Type</span>
          <input type="text" readOnly value={isSharedWall ? 'Shared wall' : 'Wall'} />
        </label>

        {isSharedWall && (
          <label className="bar-field-compact bar-field-readonly">
            <span>Rooms</span>
            <input type="text" readOnly value={sharedRoomNames} />
          </label>
        )}

        <label className="bar-field-compact bar-field-readonly">
          <span>Length</span>
          <input type="text" readOnly value={formatFeetInches(wallLength(selectedWall))} />
        </label>

        <div className="room-bottom-bar-actions">
          {canSplitSelectedWall && (
            <button
              type="button"
              onClick={() => splitSelectedWall(selectedWallId!)}
              title="Add a corner at the wall midpoint"
            >
              Split wall
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={deleteSelected}
            title={
              isSharedWall
                ? `Remove the shared wall between ${sharedRoomNames.replace(/ · /g, ' and ')}`
                : 'Remove this wall'
            }
          >
            {isSharedWall ? 'Disconnect rooms' : 'Delete wall'}
          </button>
        </div>
      </footer>
    )
  }

  if (selectedDoor) {
    return (
      <footer className="room-bottom-bar">
        <label className="bar-field-compact bar-field-readonly">
          <span>Type</span>
          <input type="text" readOnly value="Door" />
        </label>

        <label className="bar-field-compact bar-field-readonly">
          <span>Width</span>
          <input type="text" readOnly value={formatFeetInches(selectedDoor.width)} />
        </label>

        <label className="bar-field-compact bar-field-readonly">
          <span>Height</span>
          <input type="text" readOnly value={formatFeetInches(selectedDoor.height)} />
        </label>

        <label className="bar-field-compact bar-field-readonly">
          <span>Type</span>
          <input type="text" readOnly value={doorStyleLabel(selectedDoor.style)} />
        </label>

        <label className="bar-field-compact bar-field-readonly">
          <span>Swing</span>
          <input
            type="text"
            readOnly
            value={doorSwingLabel(selectedDoor)}
            title="Use ↺ ↻ or R / Shift+R to change swing"
          />
        </label>

        <RotateButtons
          onRotate={rotateSelected}
          cwTitle="Next swing option (R)"
          ccwTitle="Previous swing option (Shift+R)"
        />

        <div className="room-bottom-bar-actions">
          <button type="button" className="danger" onClick={deleteSelected}>
            Delete
          </button>
        </div>
      </footer>
    )
  }

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
          <button type="button" onClick={() => duplicateFurniture(selectedFurniture.id)}>
            Duplicate
          </button>
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
          Select a room, wall, door, or furniture. Click wall centerlines to select shared walls.
        </span>
      </footer>
    )
  }

  const { width, depth } = roomBoundingSize(state.plan, selectedRoom)
  const roomCanSplit = canSplitRoom(state.plan, selectedRoom.id)

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
        <span>Size</span>
        <input type="text" readOnly value={`${formatFeetInches(width)} × ${formatFeetInches(depth)}`} />
      </label>

      <label className="bar-field-compact">
        <span>Height</span>
        <input
          type="number"
          min={7}
          max={20}
          step={0.5}
          value={selectedRoom.wallHeight}
          onChange={(e) => setNumber('wallHeight', e.target.value)}
        />
      </label>

      <RotateButtons onRotate={rotateSelected} />

      <div className="room-bottom-bar-actions">
        {roomCanSplit && (
          <button
            type="button"
            onClick={() => splitRoomInPlan(selectedRoom.id)}
            title="Divide this room into two with an interior wall"
          >
            Split room
          </button>
        )}
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

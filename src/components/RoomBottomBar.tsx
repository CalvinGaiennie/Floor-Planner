import { useFloorPlan } from '../context/FloorPlanContext'
import { rotationDegrees, wallLength } from '../utils/geometry'
import { formatFeetInches } from '../utils/imperial'
import { doorStyleLabel, doorSwingLabel } from '../utils/doors'
import {
  canConnectRoomsAtWall,
  canConnectVertex,
  getConnectableWallsForRoom,
  getLinkedRoomIds,
  getRoom,
  getRoomsAtVertex,
  getSharedWallRoomIds,
  getWall,
  isPlanWallId,
  isRoomsConnectedAtWall,
  isSharedVertex,
  isVertexId,
  resolveWall,
  roomBoundingSize,
  wallsAtVertex,
} from '../utils/planModel'

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
    disconnectSharedWall,
    connectSharedWall,
    connectCorner,
    disconnectFromRoom,
    disconnectWallFromCorner,
    disconnectCornerFromRoom,
  } = useFloorPlan()

  const selectedWallId =
    state.selectedId && isPlanWallId(state.plan, state.selectedId) ? state.selectedId : null
  const selectedWall = selectedWallId
    ? resolveWall(state.plan, getWall(state.plan, selectedWallId)!)
    : null
  const isConnectedWall = selectedWallId ? isRoomsConnectedAtWall(state.plan, selectedWallId) : false
  const canConnectWall = selectedWallId ? canConnectRoomsAtWall(state.plan, selectedWallId) : false
  const sharedRoomNames = selectedWallId
    ? getSharedWallRoomIds(state.plan, selectedWallId)
        .map((id) => getRoom(state.plan, id)?.name ?? 'Room')
        .join(' · ')
    : ''

  const selectedVertexId =
    state.selectedId && isVertexId(state.plan, state.selectedId) ? state.selectedId : null

  if (selectedWall) {
    return (
      <footer className="room-bottom-bar">
        <label className="bar-field-compact bar-field-readonly">
          <span>Type</span>
          <input
            type="text"
            readOnly
            value={isConnectedWall ? 'Shared wall' : canConnectWall ? 'Aligned wall' : 'Wall'}
          />
        </label>

        {(isConnectedWall || canConnectWall) && (
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
          {canConnectWall && (
            <button
              type="button"
              className="connect"
              onClick={() => connectSharedWall(selectedWallId!)}
              title="Merge corners so rooms move together along this wall"
            >
              Connect rooms
            </button>
          )}
          {isConnectedWall && (
            <button
              type="button"
              className="danger"
              onClick={() => disconnectSharedWall(selectedWallId!)}
              title="Separate rooms along this wall — walls stay, drag a room to move it away"
            >
              Disconnect rooms
            </button>
          )}
          {!canConnectWall && !isConnectedWall && (
            <button type="button" className="danger" onClick={deleteSelected} title="Remove this wall">
              Delete wall
            </button>
          )}
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

  if (selectedVertexId) {
    const walls = wallsAtVertex(state.plan, selectedVertexId)
    const roomIds = getRoomsAtVertex(state.plan, selectedVertexId)
    const sharedCorner = isSharedVertex(state.plan, selectedVertexId)
    const canConnectCorner = canConnectVertex(state.plan, selectedVertexId)
    const cornerRoomNames = roomIds
      .map((id) => getRoom(state.plan, id)?.name ?? 'Room')
      .join(' · ')

    return (
      <footer className="room-bottom-bar">
        <label className="bar-field-compact bar-field-readonly">
          <span>Type</span>
          <input type="text" readOnly value={sharedCorner ? 'Shared corner' : 'Corner'} />
        </label>

        {sharedCorner && (
          <label className="bar-field-compact bar-field-readonly">
            <span>Rooms</span>
            <input type="text" readOnly value={cornerRoomNames} />
          </label>
        )}

        <div className="corner-disconnect-list">
          {walls.map((wall) => {
            const room = getRoom(state.plan, wall.roomId)
            const resolved = resolveWall(state.plan, wall)
            if (!resolved) return null
            return (
              <div key={wall.id} className="corner-disconnect-row">
                <span className="corner-disconnect-label">
                  {room?.name ?? 'Room'} · {formatFeetInches(wallLength(resolved))}
                </span>
                <button
                  type="button"
                  onClick={() => disconnectWallFromCorner(wall.id, selectedVertexId)}
                  title="Detach this wall from the corner without deleting it"
                >
                  Disconnect wall
                </button>
              </div>
            )
          })}
        </div>

        <div className="room-bottom-bar-actions">
          {canConnectCorner && (
            <button
              type="button"
              className="connect"
              onClick={() => connectCorner(selectedVertexId)}
              title="Merge corners at this point so rooms share the corner again"
            >
              Connect corner
            </button>
          )}
          {sharedCorner &&
            roomIds.map((roomId) => {
              const name = getRoom(state.plan, roomId)?.name ?? 'Room'
              return (
                <button
                  key={roomId}
                  type="button"
                  onClick={() => disconnectCornerFromRoom(selectedVertexId, roomId)}
                  title={`Stop ${name} from sharing this corner point`}
                >
                  Separate {name}
                </button>
              )
            })}
        </div>
      </footer>
    )
  }

  if (!selectedRoom) {
    return (
      <footer className="room-bottom-bar room-bottom-bar-empty">
        <span className="room-bottom-bar-hint">
          Select a room, corner, wall, door, or furniture. Use Connect / Disconnect in the footer
          when rooms share a wall or corner.
        </span>
      </footer>
    )
  }

  const { width, depth } = roomBoundingSize(state.plan, selectedRoom)
  const linkedRoomIds = getLinkedRoomIds(state.plan, selectedRoom.id)
  const connectableWalls = getConnectableWallsForRoom(state.plan, selectedRoom.id)

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
        {connectableWalls.map(({ wallId, otherRoomIds }) => {
          const otherNames = otherRoomIds
            .map((id) => getRoom(state.plan, id)?.name ?? 'Room')
            .join(', ')
          return (
            <button
              key={wallId}
              type="button"
              className="connect"
              onClick={() => connectSharedWall(wallId)}
              title={`Link ${selectedRoom.name} and ${otherNames} at this wall`}
            >
              Connect to {otherNames}
            </button>
          )
        })}
        {linkedRoomIds.map((otherId) => {
          const otherName = getRoom(state.plan, otherId)?.name ?? 'Room'
          return (
            <button
              key={otherId}
              type="button"
              onClick={() => disconnectFromRoom(selectedRoom.id, otherId)}
              title={`Separate from ${otherName} at any shared wall or corner`}
            >
              Disconnect from {otherName}
            </button>
          )
        })}
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

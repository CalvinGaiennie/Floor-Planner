import { useFloorPlan } from '../context/FloorPlanContext'
import type { Room } from '../types/floorPlan'
import { formatFeetInches } from '../utils/imperial'
import {
  getWall,
  isRoomClosed,
  resolveWall,
  roomBoundingSize,
  roomClosedPolygon,
} from '../utils/planModel'

const THUMB_SIZE = 28

function RoomThumbnail({ room, plan }: { room: Room; plan: import('../types/floorPlan').FloorPlan }) {
  const closedPolygon = roomClosedPolygon(plan, room)
  const wallSegments = room.wallIds
    .map((id) => {
      const wall = getWall(plan, id)
      return wall ? resolveWall(plan, wall) : null
    })
    .filter((w): w is NonNullable<typeof w> => w !== null)

  const allPoints = wallSegments.flatMap((w) => [w.start, w.end])
  if (allPoints.length === 0) {
    return (
      <svg className="room-thumb-svg" width={THUMB_SIZE} height={THUMB_SIZE} viewBox={`0 0 ${THUMB_SIZE} ${THUMB_SIZE}`} aria-hidden>
        <rect x={0} y={0} width={THUMB_SIZE} height={THUMB_SIZE} fill="#1e293b" rx={4} />
      </svg>
    )
  }

  const xs = allPoints.map((c) => c.x)
  const ys = allPoints.map((c) => c.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 5
  const widthFt = maxX - minX || 1
  const heightFt = maxY - minY || 1
  const scale = (THUMB_SIZE - pad * 2) / Math.max(widthFt, heightFt)
  const offsetX = pad + ((THUMB_SIZE - pad * 2) - widthFt * scale) / 2
  const offsetY = pad + ((THUMB_SIZE - pad * 2) - heightFt * scale) / 2

  const toSvg = (c: { x: number; y: number }) =>
    `${offsetX + (c.x - minX) * scale},${offsetY + (c.y - minY) * scale}`

  const fillPoints =
    closedPolygon && closedPolygon.length >= 3
      ? closedPolygon.map((c) => toSvg(c)).join(' ')
      : null

  return (
    <svg
      className="room-thumb-svg"
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      viewBox={`0 0 ${THUMB_SIZE} ${THUMB_SIZE}`}
      aria-hidden
    >
      <rect x={0} y={0} width={THUMB_SIZE} height={THUMB_SIZE} fill="#1e293b" rx={4} />
      {fillPoints && <polygon points={fillPoints} fill="#bfdbfe" />}
      {wallSegments.map((wall) => (
        <line
          key={wall.id}
          x1={offsetX + (wall.start.x - minX) * scale}
          y1={offsetY + (wall.start.y - minY) * scale}
          x2={offsetX + (wall.end.x - minX) * scale}
          y2={offsetY + (wall.end.y - minY) * scale}
          stroke="#3b82f6"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

export function RoomListPanel() {
  const { state, selectedRoom, select, setTool } = useFloorPlan()
  const { plan } = state
  const { rooms } = plan

  const handleSelect = (roomId: string) => {
    setTool('select')
    select(roomId)
  }

  return (
    <aside className="room-list-panel" aria-label="Rooms">
      <div className="room-list-header">
        <h2>Rooms</h2>
        <span className="room-list-count">{rooms.length}</span>
      </div>
      <div className="room-list-scroll">
        {rooms.length === 0 ? (
          <p className="room-list-empty">No rooms yet.</p>
        ) : (
          <ul className="room-list">
            {rooms.map((room) => {
              const selected = selectedRoom?.id === room.id
              const { width, depth } = roomBoundingSize(plan, room)
              const closed = isRoomClosed(plan, room)
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    className={`room-list-item${selected ? ' selected' : ''}`}
                    onClick={() => handleSelect(room.id)}
                  >
                    <RoomThumbnail room={room} plan={plan} />
                    <span className="room-list-details">
                      <span className="room-list-name">
                        {room.name}
                        {!closed && <span className="room-list-open-tag"> open</span>}
                      </span>
                      <span className="room-list-size">
                        {formatFeetInches(width)} × {formatFeetInches(depth)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

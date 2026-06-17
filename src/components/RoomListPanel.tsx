import { useFloorPlan } from '../context/FloorPlanContext'
import type { Room } from '../types/floorPlan'
import { formatFeetInches } from '../utils/imperial'
import { roomCorners } from '../utils/rooms'

const THUMB_SIZE = 28

function RoomThumbnail({ room }: { room: Room }) {
  const corners = roomCorners(room)
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
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
  const points = corners
    .map((c) => `${offsetX + (c.x - minX) * scale},${offsetY + (c.y - minY) * scale}`)
    .join(' ')

  return (
    <svg
      className="room-thumb-svg"
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      viewBox={`0 0 ${THUMB_SIZE} ${THUMB_SIZE}`}
      aria-hidden
    >
      <rect
        x={0}
        y={0}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        fill="#1e293b"
        rx={4}
      />
      <polygon points={points} fill="#bfdbfe" stroke="#3b82f6" strokeWidth={1.5} />
    </svg>
  )
}

export function RoomListPanel() {
  const { state, selectedRoom, select, setTool } = useFloorPlan()
  const { rooms } = state.plan

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
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    className={`room-list-item${selected ? ' selected' : ''}`}
                    onClick={() => handleSelect(room.id)}
                  >
                    <RoomThumbnail room={room} />
                    <span className="room-list-details">
                      <span className="room-list-name">{room.name}</span>
                      <span className="room-list-size">
                        {formatFeetInches(room.width)} × {formatFeetInches(room.depth)}
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

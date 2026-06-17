import { useEffect, useState } from 'react'
import { useFloorPlan } from '../context/FloorPlanContext'
import type { Room } from '../types/floorPlan'
import { MIN_WALL_LENGTH } from '../types/floorPlan'
import { formatFeetInches } from '../utils/imperial'
import {
  getWall,
  isRoomClosed,
  resolveWall,
  roomBoundingSize,
  roomClosedPolygon,
} from '../utils/planModel'

const THUMB_SIZE = 28
const ROOMS_OPEN_KEY = 'floor-planner-rooms-open'

function RoomsIcon() {
  return (
    <svg
      className="room-list-fab-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

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
  const { state, selectedRoom, select, setTool, updateRoom } = useFloorPlan()
  const { plan } = state
  const { rooms } = plan
  const [open, setOpen] = useState(() => localStorage.getItem(ROOMS_OPEN_KEY) !== '0')
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    localStorage.setItem(ROOMS_OPEN_KEY, open ? '1' : '0')
  }, [open])

  const handleRowClick = (roomId: string) => {
    setTool('select')
    select(roomId)
    setExpandedRoomIds((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  const setDimension = (roomId: string, field: 'width' | 'depth', raw: string, current: { width: number; depth: number }) => {
    const value = Number(raw)
    if (!Number.isFinite(value) || value < MIN_WALL_LENGTH) return
    updateRoom(roomId, {
      width: field === 'width' ? value : current.width,
      depth: field === 'depth' ? value : current.depth,
    })
  }

  return (
    <div className="room-list-root">
      <button
        type="button"
        className={`room-list-fab${open ? ' hidden' : ''}`}
        aria-label="Open rooms panel"
        title="Rooms"
        onClick={() => setOpen(true)}
      >
        <RoomsIcon />
        {rooms.length > 0 && <span className="room-list-fab-badge">{rooms.length}</span>}
      </button>

      {open && (
        <aside className="room-list-panel" aria-label="Rooms">
          <div className="room-list-header">
            <h2>Rooms</h2>
            <div className="room-list-header-actions">
              <span className="room-list-count">{rooms.length}</span>
              <button
                type="button"
                className="room-list-collapse"
                onClick={() => setOpen(false)}
                aria-label="Collapse rooms panel"
                title="Collapse"
              >
                ‹
              </button>
            </div>
          </div>
          <div className="room-list-scroll">
            {rooms.length === 0 ? (
              <p className="room-list-empty">No rooms yet.</p>
            ) : (
              <ul className="room-list">
                {rooms.map((room) => {
                  const selected = selectedRoom?.id === room.id
                  const expanded = expandedRoomIds.has(room.id)
                  const { width, depth } = roomBoundingSize(plan, room)
                  const closed = isRoomClosed(plan, room)
                  return (
                    <li key={room.id} className={`room-list-entry${selected ? ' selected' : ''}${expanded ? ' expanded' : ''}`}>
                      <button
                        type="button"
                        className="room-list-item"
                        onClick={() => handleRowClick(room.id)}
                        aria-expanded={expanded}
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
                      {expanded && (
                        <div className="room-list-edit">
                          <label className="room-list-field">
                            <span>Name</span>
                            <input
                              type="text"
                              value={room.name}
                              onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                            />
                          </label>
                          <div className="room-list-field-row">
                            <label className="room-list-field">
                              <span>Width (ft)</span>
                              <input
                                type="number"
                                min={MIN_WALL_LENGTH}
                                step={0.5}
                                value={Number(width.toFixed(1))}
                                onChange={(e) => setDimension(room.id, 'width', e.target.value, { width, depth })}
                              />
                            </label>
                            <label className="room-list-field">
                              <span>Depth (ft)</span>
                              <input
                                type="number"
                                min={MIN_WALL_LENGTH}
                                step={0.5}
                                value={Number(depth.toFixed(1))}
                                onChange={(e) => setDimension(room.id, 'depth', e.target.value, { width, depth })}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

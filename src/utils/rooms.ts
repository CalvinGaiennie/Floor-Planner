import type { Point2D, Room, Wall } from '../types/floorPlan'
import { MIN_ROOM_DIMENSION, MAX_ROOM_DIMENSION } from '../types/floorPlan'
import { isPointInsideFurniture } from './geometry'
import { snapToGrid } from './imperial'

export function roomCorners(room: Room): Point2D[] {
  const hw = room.width / 2
  const hd = room.depth / 2
  const cos = Math.cos(room.rotation)
  const sin = Math.sin(room.rotation)
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]

  return local.map((p) => ({
    x: room.position.x + p.x * cos - p.y * sin,
    y: room.position.y + p.x * sin + p.y * cos,
  }))
}

export function wallsFromRoom(room: Room): Wall[] {
  const corners = roomCorners(room)
  return corners.map((start, i) => ({
    id: `${room.id}-w${i}`,
    start,
    end: corners[(i + 1) % corners.length],
    thickness: room.wallThickness,
    height: room.wallHeight,
  }))
}

export function getPlanWalls(rooms: Room[]): Wall[] {
  return rooms.flatMap(wallsFromRoom)
}

export function isPointInsideRoom(point: Point2D, room: Room): boolean {
  return isPointInsideFurniture(point, room.position, room.width, room.depth, room.rotation)
}

export function roomWallIds(roomId: string): string[] {
  return [0, 1, 2, 3].map((i) => `${roomId}-w${i}`)
}

export function findRoomByWallId(rooms: Room[], wallId: string): Room | undefined {
  const roomId = wallId.replace(/-w\d+$/, '')
  return rooms.find((r) => r.id === roomId)
}

export function nextRoomName(rooms: Room[]): string {
  const used = new Set(rooms.map((r) => r.name))
  let i = rooms.length + 1
  while (used.has(`Room ${i}`)) i += 1
  return `Room ${i}`
}

export function parseWallId(wallId: string): { roomId: string; wallIndex: number } | null {
  const match = wallId.match(/^(.+)-w([0-3])$/)
  if (!match) return null
  return { roomId: match[1], wallIndex: Number(match[2]) }
}

export function isWallId(id: string): boolean {
  return /-w[0-3]$/.test(id)
}

function pointsEqual(a: Point2D, b: Point2D, eps = 0.05): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps
}

export function wallsCoincide(w1: Wall, w2: Wall): boolean {
  return (
    (pointsEqual(w1.start, w2.end) && pointsEqual(w1.end, w2.start)) ||
    (pointsEqual(w1.start, w2.start) && pointsEqual(w1.end, w2.end))
  )
}

export function findSharedWallHandles(
  wallId: string,
  rooms: Room[],
): { roomId: string; wallIndex: number }[] {
  const parsed = parseWallId(wallId)
  if (!parsed) return []

  const walls = getPlanWalls(rooms)
  const targetWall = walls.find((w) => w.id === wallId)
  if (!targetWall) return [parsed]

  const handles: { roomId: string; wallIndex: number }[] = [parsed]

  for (const wall of walls) {
    if (wall.id === wallId) continue
    if (wallsCoincide(targetWall, wall)) {
      const partner = parseWallId(wall.id)
      if (partner && !handles.some((h) => h.roomId === partner.roomId && h.wallIndex === partner.wallIndex)) {
        handles.push(partner)
      }
    }
  }

  return handles
}

export interface WallDragAnchor {
  fixedCornerA: Point2D
  fixedCornerB: Point2D
  fixedMidX: number
  fixedMidY: number
  normalX: number
  normalY: number
  parallelLength: number
  rotation: number
  wallIndex: number
  startPerpLength: number
  startSignedFull: number
}

export function createWallDragAnchor(
  room: Room,
  wallIndex: number,
  grabPoint: Point2D,
): WallDragAnchor {
  const corners = roomCorners(room)
  const fi = (wallIndex + 2) % 4
  const fj = (wallIndex + 3) % 4
  const di = wallIndex
  const dj = (wallIndex + 1) % 4
  const fixedCornerA = { x: corners[fi].x, y: corners[fi].y }
  const fixedCornerB = { x: corners[fj].x, y: corners[fj].y }
  const fixedMidX = (fixedCornerA.x + fixedCornerB.x) / 2
  const fixedMidY = (fixedCornerA.y + fixedCornerB.y) / 2
  const dragMidX = (corners[di].x + corners[dj].x) / 2
  const dragMidY = (corners[di].y + corners[dj].y) / 2

  let nx = dragMidX - fixedMidX
  let ny = dragMidY - fixedMidY
  const nLen = Math.hypot(nx, ny)
  if (nLen < 1e-6) {
    const ex = fixedCornerB.x - fixedCornerA.x
    const ey = fixedCornerB.y - fixedCornerA.y
    const eLen = Math.hypot(ex, ey) || 1
    nx = -ey / eLen
    ny = ex / eLen
  } else {
    nx /= nLen
    ny /= nLen
  }

  const parallelLength = Math.hypot(fixedCornerB.x - fixedCornerA.x, fixedCornerB.y - fixedCornerA.y)
  const isDepthWall = wallIndex % 2 === 0
  const startPerpLength = isDepthWall ? room.depth : room.width
  const startSignedFull =
    (grabPoint.x - fixedMidX) * nx + (grabPoint.y - fixedMidY) * ny

  return {
    fixedCornerA,
    fixedCornerB,
    fixedMidX,
    fixedMidY,
    normalX: nx,
    normalY: ny,
    parallelLength,
    rotation: room.rotation,
    wallIndex,
    startPerpLength,
    startSignedFull,
  }
}

function clampPerpLength(value: number): number {
  return Math.min(
    MAX_ROOM_DIMENSION,
    Math.max(MIN_ROOM_DIMENSION, snapToGrid(Math.max(MIN_ROOM_DIMENSION, value))),
  )
}

/** Resize a room by dragging one wall. The opposite edge stays fixed in world space. */
export function resizeRoomByWallDrag(
  room: Room,
  worldPoint: Point2D,
  anchor: WallDragAnchor,
): Room {
  const {
    fixedMidX,
    fixedMidY,
    normalX,
    normalY,
    parallelLength,
    rotation,
    wallIndex,
    startPerpLength,
    startSignedFull,
  } = anchor

  if (parallelLength < 1e-6) return room

  const signedNow =
    (worldPoint.x - fixedMidX) * normalX + (worldPoint.y - fixedMidY) * normalY
  const perpLength = clampPerpLength(startPerpLength + (signedNow - startSignedFull))

  const isDepthWall = wallIndex % 2 === 0
  const width = isDepthWall ? parallelLength : perpLength
  const depth = isDepthWall ? perpLength : parallelLength

  // Center sits halfway between the fixed edge and the dragged edge.
  const halfOffset = perpLength / 2
  return {
    ...room,
    position: {
      x: fixedMidX + normalX * halfOffset,
      y: fixedMidY + normalY * halfOffset,
    },
    width,
    depth,
    rotation,
  }
}

export function wallDragCursor(wallIndex: number, rotation: number): string {
  const localAngles = [0, 90, 0, 90]
  const deg = (((localAngles[wallIndex] + (rotation * 180) / Math.PI) % 180) + 180) % 180
  return deg < 45 || deg > 135 ? 'ns-resize' : 'ew-resize'
}

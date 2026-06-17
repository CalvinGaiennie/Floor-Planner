import { v4 as uuid } from 'uuid'
import { pruneDoors } from './doors'
import {
  DEFAULT_ROOM_DEPTH,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  MIN_WALL_LENGTH,
  type FloorPlan,
  type PlanWall,
  type Point2D,
  type Room,
  type Vertex,
  type Wall,
} from '../types/floorPlan'
import { wallsShareSegment, findCoincidentWallIds } from './geometry'
import { snapToGrid } from './imperial'

function snapPoint(point: Point2D): Point2D {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

export function getVertex(plan: FloorPlan, id: string): Vertex | undefined {
  return plan.vertices.find((v) => v.id === id)
}

export function getWall(plan: FloorPlan, id: string): PlanWall | undefined {
  return plan.walls.find((w) => w.id === id)
}

export function getRoom(plan: FloorPlan, id: string): Room | undefined {
  return plan.rooms.find((r) => r.id === id)
}

export function resolveWall(plan: FloorPlan, wall: PlanWall): Wall | null {
  const start = getVertex(plan, wall.startVertexId)
  const end = getVertex(plan, wall.endVertexId)
  if (!start || !end) return null
  return {
    id: wall.id,
    roomId: wall.roomId,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    thickness: wall.thickness,
    height: wall.height,
  }
}

export function resolveWalls(plan: FloorPlan): Wall[] {
  return plan.walls
    .map((wall) => resolveWall(plan, wall))
    .filter((wall): wall is Wall => wall !== null)
}

export function isPlanWallId(plan: FloorPlan, id: string): boolean {
  return plan.walls.some((w) => w.id === id)
}

export function isVertexId(plan: FloorPlan, id: string): boolean {
  return plan.vertices.some((v) => v.id === id)
}

export function findRoomByWallId(plan: FloorPlan, wallId: string): Room | undefined {
  const wall = getWall(plan, wallId)
  if (!wall) return undefined
  return getRoom(plan, wall.roomId)
}

export function findRoomByVertexId(plan: FloorPlan, vertexId: string): Room | undefined {
  for (const wall of plan.walls) {
    if (wall.startVertexId === vertexId || wall.endVertexId === vertexId) {
      return getRoom(plan, wall.roomId)
    }
  }
  return undefined
}

export function nextRoomName(rooms: Room[]): string {
  const used = new Set(rooms.map((r) => r.name))
  let i = rooms.length + 1
  while (used.has(`Room ${i}`)) i += 1
  return `Room ${i}`
}

export function roomVertexIds(plan: FloorPlan, room: Room): string[] {
  const ids = new Set<string>()
  for (const wallId of room.wallIds) {
    const wall = getWall(plan, wallId)
    if (!wall) continue
    ids.add(wall.startVertexId)
    ids.add(wall.endVertexId)
  }
  return [...ids]
}

export function roomOutlinePoints(plan: FloorPlan, room: Room): Point2D[] {
  if (room.wallIds.length === 0) return []

  const points: Point2D[] = []
  for (const wallId of room.wallIds) {
    const wall = getWall(plan, wallId)
    if (!wall) continue
    const start = getVertex(plan, wall.startVertexId)
    if (!start) continue
    if (points.length === 0) {
      points.push({ x: start.x, y: start.y })
    }
    const end = getVertex(plan, wall.endVertexId)
    if (end) points.push({ x: end.x, y: end.y })
  }
  return points
}

export function roomCentroid(plan: FloorPlan, room: Room): Point2D {
  const points = roomOutlinePoints(plan, room)
  if (points.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

export function roomBoundingSize(plan: FloorPlan, room: Room): { width: number; depth: number } {
  const points = roomOutlinePoints(plan, room)
  if (points.length === 0) return { width: 0, depth: 0 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  }
}

export const VERTEX_SNAP_DISTANCE = 1

export function findVertexNear(
  plan: FloorPlan,
  point: Point2D,
  threshold = VERTEX_SNAP_DISTANCE,
): Vertex | undefined {
  const snapped = snapPoint(point)
  let best: Vertex | undefined
  let bestDist = threshold
  for (const v of plan.vertices) {
    const dist = Math.hypot(v.x - snapped.x, v.y - snapped.y)
    if (dist < bestDist) {
      bestDist = dist
      best = v
    }
  }
  return best
}

export function isRoomClosed(plan: FloorPlan, room: Room): boolean {
  const walls = room.wallIds
    .map((id) => getWall(plan, id))
    .filter((w): w is PlanWall => w !== undefined)
  if (walls.length < 3) return false

  const degree = new Map<string, number>()
  for (const wall of walls) {
    degree.set(wall.startVertexId, (degree.get(wall.startVertexId) ?? 0) + 1)
    degree.set(wall.endVertexId, (degree.get(wall.endVertexId) ?? 0) + 1)
  }

  for (const count of degree.values()) {
    if (count !== 2) return false
  }

  return isConnectedWallGraph(walls)
}

function isConnectedWallGraph(walls: PlanWall[]): boolean {
  if (walls.length === 0) return false

  const visited = new Set<string>()
  const queue = [walls[0].id]
  visited.add(walls[0].id)

  while (queue.length > 0) {
    const wallId = queue.pop()!
    const wall = walls.find((w) => w.id === wallId)
    if (!wall) continue

    for (const other of walls) {
      if (visited.has(other.id)) continue
      const sharesVertex =
        other.startVertexId === wall.startVertexId ||
        other.startVertexId === wall.endVertexId ||
        other.endVertexId === wall.startVertexId ||
        other.endVertexId === wall.endVertexId
      if (sharesVertex) {
        visited.add(other.id)
        queue.push(other.id)
      }
    }
  }

  return visited.size === walls.length
}

/** Walk the wall loop in graph order — correct polygon for fill/hit tests (not wallIds list order). */
export function roomClosedPolygon(plan: FloorPlan, room: Room): Point2D[] | null {
  if (!isRoomClosed(plan, room)) return null

  const walls = room.wallIds
    .map((id) => getWall(plan, id))
    .filter((w): w is PlanWall => w !== undefined)
  if (walls.length < 3) return null

  const used = new Set<string>()
  const points: Point2D[] = []
  let vertexId = walls[0].startVertexId

  for (let step = 0; step < walls.length; step++) {
    const vertex = getVertex(plan, vertexId)
    if (!vertex) return null
    points.push({ x: vertex.x, y: vertex.y })

    const nextWall = walls.find(
      (w) =>
        !used.has(w.id) && (w.startVertexId === vertexId || w.endVertexId === vertexId),
    )
    if (!nextWall) return null

    used.add(nextWall.id)
    vertexId =
      nextWall.startVertexId === vertexId ? nextWall.endVertexId : nextWall.startVertexId
  }

  return points.length >= 3 ? points : null
}

export function pruneStaleWallIds(plan: FloorPlan): FloorPlan {
  const wallIds = new Set(plan.walls.map((w) => w.id))
  return {
    ...plan,
    rooms: plan.rooms.map((r) => ({
      ...r,
      wallIds: r.wallIds.filter((id) => wallIds.has(id)),
    })),
  }
}

/** Merge corners that sit on the same point so dragged-together corners share one vertex. */
export function mergeCoincidentVertices(plan: FloorPlan): FloorPlan {
  const vertices = plan.vertices
  if (vertices.length < 2) return plan

  const canonical = new Map<string, string>()
  for (const v of vertices) canonical.set(v.id, v.id)

  const resolveCanonical = (id: string): string => {
    let current = id
    while (canonical.get(current) !== current) {
      current = canonical.get(current)!
    }
    return current
  }

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i]
      const b = vertices[j]
      if (Math.hypot(a.x - b.x, a.y - b.y) < VERTEX_SNAP_DISTANCE) {
        const ca = resolveCanonical(a.id)
        const cb = resolveCanonical(b.id)
        if (ca !== cb) canonical.set(cb, ca)
      }
    }
  }

  const resolved = new Map<string, string>()
  for (const v of vertices) resolved.set(v.id, resolveCanonical(v.id))

  let walls = plan.walls.map((w) => ({
    ...w,
    startVertexId: resolved.get(w.startVertexId) ?? w.startVertexId,
    endVertexId: resolved.get(w.endVertexId) ?? w.endVertexId,
  }))
  walls = walls.filter((w) => w.startVertexId !== w.endVertexId)

  const wallIdSet = new Set(walls.map((w) => w.id))
  const usedVertexIds = new Set<string>()
  for (const w of walls) {
    usedVertexIds.add(w.startVertexId)
    usedVertexIds.add(w.endVertexId)
  }

  const newVertices = vertices.filter(
    (v) => usedVertexIds.has(v.id) && resolved.get(v.id) === v.id,
  )

  const rooms = plan.rooms.map((r) => ({
    ...r,
    wallIds: r.wallIds.filter((id) => wallIdSet.has(id)),
  }))

  return { ...plan, vertices: newVertices, walls, rooms }
}

export function sanitizePlan(plan: FloorPlan): FloorPlan {
  return mergeCoincidentVertices(pruneStaleWallIds(pruneDoors(plan)))
}

export function isPointInsideRoom(plan: FloorPlan, point: Point2D, room: Room): boolean {
  const verts = roomClosedPolygon(plan, room)
  if (!verts || verts.length < 3) return false

  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x
    const yi = verts[i].y
    const xj = verts[j].x
    const yj = verts[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function createVertex(point: Point2D): Vertex {
  const snapped = snapPoint(point)
  return { id: uuid(), x: snapped.x, y: snapped.y }
}

function createPlanWall(
  roomId: string,
  startVertexId: string,
  endVertexId: string,
  height: number,
  thickness: number,
): PlanWall {
  return {
    id: uuid(),
    roomId,
    startVertexId,
    endVertexId,
    height,
    thickness,
  }
}

export function createRectangleRoomAt(plan: FloorPlan, center: Point2D): FloorPlan {
  const c = snapPoint(center)
  const hw = DEFAULT_ROOM_WIDTH / 2
  const hd = DEFAULT_ROOM_DEPTH / 2
  const corners = [
    { x: c.x - hw, y: c.y - hd },
    { x: c.x + hw, y: c.y - hd },
    { x: c.x + hw, y: c.y + hd },
    { x: c.x - hw, y: c.y + hd },
  ]

  const roomId = uuid()
  const vertices = corners.map((p) => createVertex(p))
  const height = DEFAULT_WALL_HEIGHT
  const thickness = DEFAULT_WALL_THICKNESS
  const walls = [
    createPlanWall(roomId, vertices[0].id, vertices[1].id, height, thickness),
    createPlanWall(roomId, vertices[1].id, vertices[2].id, height, thickness),
    createPlanWall(roomId, vertices[2].id, vertices[3].id, height, thickness),
    createPlanWall(roomId, vertices[3].id, vertices[0].id, height, thickness),
  ]

  const room: Room = {
    id: roomId,
    name: nextRoomName(plan.rooms),
    wallIds: walls.map((w) => w.id),
    wallHeight: height,
    wallThickness: thickness,
  }

  return {
    ...plan,
    vertices: [...plan.vertices, ...vertices],
    walls: [...plan.walls, ...walls],
    rooms: [...plan.rooms, room],
  }
}

export function lastCreatedRoom(plan: FloorPlan): Room | undefined {
  return plan.rooms[plan.rooms.length - 1]
}

function removeVerticesIfOrphaned(plan: FloorPlan, vertexIds: string[]): FloorPlan {
  const used = new Set<string>()
  for (const wall of plan.walls) {
    used.add(wall.startVertexId)
    used.add(wall.endVertexId)
  }
  const remove = new Set(vertexIds.filter((id) => !used.has(id)))
  if (remove.size === 0) return plan
  return {
    ...plan,
    vertices: plan.vertices.filter((v) => !remove.has(v.id)),
  }
}

export function deleteRoom(plan: FloorPlan, roomId: string): FloorPlan {
  const room = getRoom(plan, roomId)
  if (!room) return plan

  const wallIds = new Set(room.wallIds)
  const vertexIds = roomVertexIds(plan, room)

  return removeVerticesIfOrphaned(
    {
      ...plan,
      rooms: plan.rooms.filter((r) => r.id !== roomId),
      walls: plan.walls.filter((w) => !wallIds.has(w.id)),
    },
    vertexIds,
  )
}

export function deleteWall(plan: FloorPlan, wallId: string): FloorPlan {
  const wall = getWall(plan, wallId)
  if (!wall) return plan

  const resolved = resolveWall(plan, wall)
  const removeIds = new Set<string>([wallId])
  if (resolved) {
    for (const other of plan.walls) {
      if (other.id === wallId) continue
      const otherResolved = resolveWall(plan, other)
      if (otherResolved && wallsShareSegment(resolved, otherResolved)) {
        removeIds.add(other.id)
      }
    }
  }

  const roomsToUpdate = new Map<string, string[]>()
  for (const id of removeIds) {
    const w = getWall(plan, id)
    if (!w) continue
    const room = getRoom(plan, w.roomId)
    if (!room) continue
    const wallIds = roomsToUpdate.get(room.id) ?? room.wallIds
    roomsToUpdate.set(room.id, wallIds.filter((wid) => wid !== id))
  }

  const orphanVertices = new Set<string>()
  for (const id of removeIds) {
    const w = getWall(plan, id)
    if (w) {
      orphanVertices.add(w.startVertexId)
      orphanVertices.add(w.endVertexId)
    }
  }

  return removeVerticesIfOrphaned(
    {
      ...plan,
      walls: plan.walls.filter((w) => !removeIds.has(w.id)),
      rooms: plan.rooms.map((r) => {
        const wallIds = roomsToUpdate.get(r.id)
        return wallIds ? { ...r, wallIds } : r
      }),
    },
    [...orphanVertices],
  )
}

export function getSharedWallRoomIds(plan: FloorPlan, wallId: string): string[] {
  const resolved = resolveWalls(plan)
  const ids = findCoincidentWallIds(resolved, wallId)
  const roomIds = new Set<string>()
  for (const id of ids) {
    const wall = getWall(plan, id)
    if (wall) roomIds.add(wall.roomId)
  }
  return [...roomIds]
}

export function isSharedRoomWall(plan: FloorPlan, wallId: string): boolean {
  return getSharedWallRoomIds(plan, wallId).length >= 2
}

export function disconnectRoomsAtWall(plan: FloorPlan, wallId: string): FloorPlan {
  return deleteWall(plan, wallId)
}

export function roomOrderedVertexIds(plan: FloorPlan, room: Room): string[] | null {
  if (!isRoomClosed(plan, room)) return null

  const walls = room.wallIds
    .map((id) => getWall(plan, id))
    .filter((w): w is PlanWall => w !== undefined)
  if (walls.length < 3) return null

  const used = new Set<string>()
  const ids: string[] = []
  let vertexId = walls[0].startVertexId

  for (let step = 0; step < walls.length; step++) {
    ids.push(vertexId)

    const nextWall = walls.find(
      (w) => !used.has(w.id) && (w.startVertexId === vertexId || w.endVertexId === vertexId),
    )
    if (!nextWall) return null

    used.add(nextWall.id)
    vertexId =
      nextWall.startVertexId === vertexId ? nextWall.endVertexId : nextWall.startVertexId
  }

  return ids
}

function findWallBetweenVertices(
  plan: FloorPlan,
  room: Room,
  a: string,
  b: string,
): string | null {
  for (const wallId of room.wallIds) {
    const wall = getWall(plan, wallId)
    if (!wall) continue
    if (
      (wall.startVertexId === a && wall.endVertexId === b) ||
      (wall.startVertexId === b && wall.endVertexId === a)
    ) {
      return wallId
    }
  }
  return null
}

function isAxisAlignedRectangle(plan: FloorPlan, room: Room): boolean {
  if (!isRoomClosed(plan, room)) return false
  const vertexIds = roomOrderedVertexIds(plan, room)
  if (!vertexIds || vertexIds.length !== 4) return false

  for (const wallId of room.wallIds) {
    const wall = getWall(plan, wallId)
    if (!wall) return false
    const resolved = resolveWall(plan, wall)
    if (!resolved) return false
    const dx = Math.abs(resolved.end.x - resolved.start.x)
    const dy = Math.abs(resolved.end.y - resolved.start.y)
    if (dx > 0.01 && dy > 0.01) return false
  }
  return true
}

interface SplitWallResult {
  plan: FloorPlan
  midVertexId: string
  startWallId: string
  endWallId: string
}

function splitWallAtMidpointDetailed(plan: FloorPlan, wallId: string): SplitWallResult | null {
  const wall = getWall(plan, wallId)
  if (!wall) return null
  const resolved = resolveWall(plan, wall)
  if (!resolved) return null

  const length = Math.hypot(resolved.end.x - resolved.start.x, resolved.end.y - resolved.start.y)
  if (length < MIN_WALL_LENGTH * 2) return null

  const midVertex = createVertex({
    x: (resolved.start.x + resolved.end.x) / 2,
    y: (resolved.start.y + resolved.end.y) / 2,
  })

  const toSplit = new Set<string>([wallId])
  for (const other of plan.walls) {
    if (other.id === wallId) continue
    const otherResolved = resolveWall(plan, other)
    if (otherResolved && wallsShareSegment(resolved, otherResolved)) {
      toSplit.add(other.id)
    }
  }

  const newWalls: PlanWall[] = []
  const splitMap = new Map<string, { startWallId: string; endWallId: string }>()

  for (const id of toSplit) {
    const w = getWall(plan, id)!
    const startWall = createPlanWall(w.roomId, w.startVertexId, midVertex.id, w.height, w.thickness)
    const endWall = createPlanWall(w.roomId, midVertex.id, w.endVertexId, w.height, w.thickness)
    newWalls.push(startWall, endWall)
    splitMap.set(id, { startWallId: startWall.id, endWallId: endWall.id })
  }

  const primary = splitMap.get(wallId)
  if (!primary) return null

  const nextPlan: FloorPlan = {
    ...plan,
    vertices: [...plan.vertices, midVertex],
    walls: [...plan.walls.filter((w) => !toSplit.has(w.id)), ...newWalls],
    rooms: plan.rooms.map((room) => ({
      ...room,
      wallIds: room.wallIds.flatMap((wid) => {
        const split = splitMap.get(wid)
        if (!split) return [wid]
        return [split.startWallId, split.endWallId]
      }),
    })),
  }

  return {
    plan: nextPlan,
    midVertexId: midVertex.id,
    startWallId: primary.startWallId,
    endWallId: primary.endWallId,
  }
}

function wallSegmentMidpoint(plan: FloorPlan, wallId: string): Point2D | null {
  const wall = getWall(plan, wallId)
  if (!wall) return null
  const resolved = resolveWall(plan, wall)
  if (!resolved) return null
  return {
    x: (resolved.start.x + resolved.end.x) / 2,
    y: (resolved.start.y + resolved.end.y) / 2,
  }
}

function pickSplitHalf(
  startWallId: string,
  endWallId: string,
  plan: FloorPlan,
  axis: 'x' | 'y',
  preferLow: boolean,
): string {
  const midStart = wallSegmentMidpoint(plan, startWallId)
  const midEnd = wallSegmentMidpoint(plan, endWallId)
  if (!midStart || !midEnd) return startWallId
  const startVal = axis === 'x' ? midStart.x : midStart.y
  const endVal = axis === 'x' ? midEnd.x : midEnd.y
  if (preferLow) return startVal <= endVal ? startWallId : endWallId
  return startVal >= endVal ? startWallId : endWallId
}

export function canSplitWall(plan: FloorPlan, wallId: string): boolean {
  const wall = getWall(plan, wallId)
  if (!wall) return false
  const resolved = resolveWall(plan, wall)
  if (!resolved) return false
  const length = Math.hypot(resolved.end.x - resolved.start.x, resolved.end.y - resolved.start.y)
  return length >= MIN_WALL_LENGTH * 2
}

export function splitWallAtMidpoint(plan: FloorPlan, wallId: string): FloorPlan {
  const result = splitWallAtMidpointDetailed(plan, wallId)
  return result?.plan ?? plan
}

export function canSplitRoom(plan: FloorPlan, roomId: string): boolean {
  const room = getRoom(plan, roomId)
  if (!room) return false
  return isAxisAlignedRectangle(plan, room)
}

export function splitRoom(plan: FloorPlan, roomId: string): FloorPlan {
  const room = getRoom(plan, roomId)
  if (!room || !canSplitRoom(plan, roomId)) return plan

  const vertexIds = roomOrderedVertexIds(plan, room)
  if (!vertexIds || vertexIds.length !== 4) return plan

  const vertices = vertexIds.map((id) => getVertex(plan, id)).filter((v): v is Vertex => v !== undefined)
  if (vertices.length !== 4) return plan

  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const depth = Math.max(...ys) - Math.min(...ys)
  const verticalSplit = width >= depth

  let planState = plan
  const [v0, v1, v2, v3] = vertexIds

  if (verticalSplit) {
    const bottomId = findWallBetweenVertices(planState, room, v0, v1)
    const topId =
      findWallBetweenVertices(planState, room, v2, v3) ??
      findWallBetweenVertices(planState, room, v3, v2)
    const leftId = findWallBetweenVertices(planState, room, v3, v0)
    const rightId = findWallBetweenVertices(planState, room, v1, v2)
    if (!bottomId || !topId || !leftId || !rightId) return plan

    const bottom = splitWallAtMidpointDetailed(planState, bottomId)
    if (!bottom) return plan
    planState = bottom.plan

    const roomAfterBottom = getRoom(planState, roomId)!
    const topIdNow =
      findWallBetweenVertices(planState, roomAfterBottom, v2, v3) ??
      findWallBetweenVertices(planState, roomAfterBottom, v3, v2)
    if (!topIdNow) return plan

    const top = splitWallAtMidpointDetailed(planState, topIdNow)
    if (!top) return plan
    planState = top.plan

    const m0 = bottom.midVertexId
    const m2 = top.midVertexId
    const interiorA = createPlanWall(roomId, m0, m2, room.wallHeight, room.wallThickness)
    const newRoomId = uuid()
    const interiorB = createPlanWall(newRoomId, m2, m0, room.wallHeight, room.wallThickness)

    const bottomLeft = pickSplitHalf(bottom.startWallId, bottom.endWallId, planState, 'x', true)
    const bottomRight = bottomLeft === bottom.startWallId ? bottom.endWallId : bottom.startWallId
    const topLeft = pickSplitHalf(top.startWallId, top.endWallId, planState, 'x', true)
    const topRight = topLeft === top.startWallId ? top.endWallId : top.startWallId

    const leftWallIds = [leftId, bottomLeft, interiorA.id, topLeft]
    const rightWallIds = [bottomRight, rightId, topRight, interiorB.id]
    const newRoom: Room = {
      id: newRoomId,
      name: nextRoomName(planState.rooms),
      wallIds: rightWallIds,
      wallHeight: room.wallHeight,
      wallThickness: room.wallThickness,
    }

    return sanitizePlan({
      ...planState,
      walls: [...planState.walls, interiorA, interiorB],
      rooms: planState.rooms.map((r) =>
        r.id === roomId ? { ...r, wallIds: leftWallIds } : r,
      ).concat(newRoom),
    })
  }

  const bottomId = findWallBetweenVertices(planState, room, v0, v1)
  const topId =
    findWallBetweenVertices(planState, room, v2, v3) ??
    findWallBetweenVertices(planState, room, v3, v2)
  const leftId = findWallBetweenVertices(planState, room, v3, v0)
  const rightId = findWallBetweenVertices(planState, room, v1, v2)
  if (!bottomId || !topId || !leftId || !rightId) return plan

  const left = splitWallAtMidpointDetailed(planState, leftId)
  if (!left) return plan
  planState = left.plan

  const roomAfterLeft = getRoom(planState, roomId)!
  const rightIdNow = findWallBetweenVertices(planState, roomAfterLeft, v1, v2)
  if (!rightIdNow) return plan

  const right = splitWallAtMidpointDetailed(planState, rightIdNow)
  if (!right) return plan
  planState = right.plan

  const m3 = left.midVertexId
  const m1 = right.midVertexId
  const interiorA = createPlanWall(roomId, m1, m3, room.wallHeight, room.wallThickness)
  const newRoomId = uuid()
  const interiorB = createPlanWall(newRoomId, m3, m1, room.wallHeight, room.wallThickness)

  const leftBottom = pickSplitHalf(left.startWallId, left.endWallId, planState, 'y', true)
  const leftTop = leftBottom === left.startWallId ? left.endWallId : left.startWallId
  const rightBottom = pickSplitHalf(right.startWallId, right.endWallId, planState, 'y', true)
  const rightTop = rightBottom === right.startWallId ? right.endWallId : right.startWallId

  const bottomWallIds = [bottomId, rightBottom, interiorA.id, leftBottom]
  const topWallIds = [leftTop, interiorB.id, rightTop, topId]
  const newRoom: Room = {
    id: newRoomId,
    name: nextRoomName(planState.rooms),
    wallIds: topWallIds,
    wallHeight: room.wallHeight,
    wallThickness: room.wallThickness,
  }

  return sanitizePlan({
    ...planState,
    walls: [...planState.walls, interiorA, interiorB],
    rooms: planState.rooms.map((r) =>
      r.id === roomId ? { ...r, wallIds: bottomWallIds } : r,
    ).concat(newRoom),
  })
}

export function duplicateRoom(plan: FloorPlan, roomId: string): FloorPlan {
  const source = getRoom(plan, roomId)
  if (!source) return plan

  const { width } = roomBoundingSize(plan, source)
  const offset = width + 1
  const newRoomId = uuid()
  const vertexMap = new Map<string, string>()
  const newVertices: Vertex[] = []
  const newWalls: PlanWall[] = []

  for (const vid of roomVertexIds(plan, source)) {
    const v = getVertex(plan, vid)
    if (!v) continue
    const copy = createVertex({ x: v.x + offset, y: v.y })
    vertexMap.set(vid, copy.id)
    newVertices.push(copy)
  }

  for (const wallId of source.wallIds) {
    const wall = getWall(plan, wallId)
    if (!wall) continue
    const startId = vertexMap.get(wall.startVertexId)
    const endId = vertexMap.get(wall.endVertexId)
    if (!startId || !endId) continue
    newWalls.push({
      id: uuid(),
      roomId: newRoomId,
      startVertexId: startId,
      endVertexId: endId,
      height: wall.height,
      thickness: wall.thickness,
    })
  }

  const duplicate: Room = {
    id: newRoomId,
    name: nextRoomName(plan.rooms),
    wallIds: newWalls.map((w) => w.id),
    wallHeight: source.wallHeight,
    wallThickness: source.wallThickness,
  }

  return {
    ...plan,
    vertices: [...plan.vertices, ...newVertices],
    walls: [...plan.walls, ...newWalls],
    rooms: [...plan.rooms, duplicate],
  }
}

export function reorderRoom(plan: FloorPlan, activeId: string, overId: string): FloorPlan {
  if (activeId === overId) return plan
  const fromIndex = plan.rooms.findIndex((r) => r.id === activeId)
  const toIndex = plan.rooms.findIndex((r) => r.id === overId)
  if (fromIndex < 0 || toIndex < 0) return plan

  const rooms = [...plan.rooms]
  const [item] = rooms.splice(fromIndex, 1)
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
  rooms.splice(insertAt, 0, item)
  return { ...plan, rooms }
}

export function translateRoom(plan: FloorPlan, roomId: string, delta: Point2D): FloorPlan {
  const room = getRoom(plan, roomId)
  if (!room) return plan
  const ids = roomVertexIds(plan, room)
  return {
    ...plan,
    vertices: plan.vertices.map((v) =>
      ids.includes(v.id)
        ? { ...v, x: snapToGrid(v.x + delta.x), y: snapToGrid(v.y + delta.y) }
        : v,
    ),
  }
}

export function rotateRoom(plan: FloorPlan, roomId: string, deltaRadians: number): FloorPlan {
  if (Math.abs(deltaRadians) < 1e-6) return plan
  const room = getRoom(plan, roomId)
  if (!room) return plan

  const centroid = roomCentroid(plan, room)
  const vertexIds = new Set(roomVertexIds(plan, room))
  const cos = Math.cos(deltaRadians)
  const sin = Math.sin(deltaRadians)

  return sanitizePlan({
    ...plan,
    vertices: plan.vertices.map((v) => {
      if (!vertexIds.has(v.id)) return v
      const dx = v.x - centroid.x
      const dy = v.y - centroid.y
      return {
        ...v,
        x: snapToGrid(centroid.x + dx * cos - dy * sin),
        y: snapToGrid(centroid.y + dx * sin + dy * cos),
      }
    }),
  })
}

export function moveVertex(plan: FloorPlan, vertexId: string, point: Point2D): FloorPlan {
  const snapped = snapPoint(point)
  return {
    ...plan,
    vertices: plan.vertices.map((v) =>
      v.id === vertexId ? { ...v, x: snapped.x, y: snapped.y } : v,
    ),
  }
}

export interface WallDragAnchor {
  wallId: string
  normalX: number
  normalY: number
  midX: number
  midY: number
  startSigned: number
  /** Vertex positions when the drag started — delta is applied from here, not cumulatively */
  startVertices: Record<string, Point2D>
}

export function createWallDragAnchor(
  plan: FloorPlan,
  wallId: string,
  grabPoint: Point2D,
): WallDragAnchor | null {
  const wall = getWall(plan, wallId)
  if (!wall) return null
  const resolved = resolveWall(plan, wall)
  if (!resolved) return null

  const midX = (resolved.start.x + resolved.end.x) / 2
  const midY = (resolved.start.y + resolved.end.y) / 2
  const ex = resolved.end.x - resolved.start.x
  const ey = resolved.end.y - resolved.start.y
  const eLen = Math.hypot(ex, ey) || 1
  const nx = -ey / eLen
  const ny = ex / eLen
  const startSigned = (grabPoint.x - midX) * nx + (grabPoint.y - midY) * ny

  const startVertices: Record<string, Point2D> = {}
  for (const vid of [wall.startVertexId, wall.endVertexId]) {
    const v = getVertex(plan, vid)
    if (v) startVertices[vid] = { x: v.x, y: v.y }
  }

  return { wallId, normalX: nx, normalY: ny, midX, midY, startSigned, startVertices }
}

export function dragWallPerpendicular(
  plan: FloorPlan,
  wallId: string,
  worldPoint: Point2D,
  anchor: WallDragAnchor,
): FloorPlan {
  const wall = getWall(plan, wallId)
  if (!wall) return plan

  const signedNow =
    (worldPoint.x - anchor.midX) * anchor.normalX + (worldPoint.y - anchor.midY) * anchor.normalY
  const delta = signedNow - anchor.startSigned
  if (Math.abs(delta) < 1e-6) return plan

  const dx = anchor.normalX * delta
  const dy = anchor.normalY * delta

  return {
    ...plan,
    vertices: plan.vertices.map((v) => {
      const start = anchor.startVertices[v.id]
      if (!start) return v
      return { ...v, x: snapToGrid(start.x + dx), y: snapToGrid(start.y + dy) }
    }),
  }
}

function resolveEndpoint(
  plan: FloorPlan,
  point: Point2D,
  pendingVertices: Vertex[],
): { vertexId: string; newVertex?: Vertex } {
  const near = findVertexNear(plan, point)
  if (near) return { vertexId: near.id }

  const pendingNear = pendingVertices.find(
    (v) => Math.hypot(v.x - snapPoint(point).x, v.y - snapPoint(point).y) < VERTEX_SNAP_DISTANCE,
  )
  if (pendingNear) return { vertexId: pendingNear.id }

  const vertex = createVertex(point)
  return { vertexId: vertex.id, newVertex: vertex }
}

function wallExists(plan: FloorPlan, startId: string, endId: string): boolean {
  return plan.walls.some(
    (w) =>
      (w.startVertexId === startId && w.endVertexId === endId) ||
      (w.startVertexId === endId && w.endVertexId === startId),
  )
}

function insertWallInChain(
  plan: FloorPlan,
  room: Room,
  newWallId: string,
  startVertexId: string,
  endVertexId: string,
): string[] {
  const wallIds = [...room.wallIds]
  if (wallIds.length === 0) return [newWallId]

  const firstWall = getWall(plan, wallIds[0])
  const lastWall = getWall(plan, wallIds[wallIds.length - 1])
  if (!firstWall || !lastWall) return [...wallIds, newWallId]

  const chainStart = firstWall.startVertexId
  const chainEnd = lastWall.endVertexId

  if (chainEnd === startVertexId) return [...wallIds, newWallId]
  if (chainEnd === endVertexId) return [...wallIds, newWallId]
  if (chainStart === endVertexId) return [newWallId, ...wallIds]
  if (chainStart === startVertexId) return [newWallId, ...wallIds]

  return [...wallIds, newWallId]
}

export function addWallBetweenPoints(
  plan: FloorPlan,
  startPoint: Point2D,
  endPoint: Point2D,
): FloorPlan {
  const start = resolveEndpoint(plan, startPoint, [])
  const pendingVertices = start.newVertex ? [start.newVertex] : []
  const end = resolveEndpoint(plan, endPoint, pendingVertices)

  if (start.vertexId === end.vertexId) return plan

  const startVertex = start.newVertex ?? getVertex(plan, start.vertexId)
  const endVertex = end.newVertex ?? getVertex(plan, end.vertexId)
  if (!startVertex || !endVertex) return plan

  const length = Math.hypot(endVertex.x - startVertex.x, endVertex.y - startVertex.y)
  if (length < MIN_WALL_LENGTH) return plan
  if (wallExists(plan, start.vertexId, end.vertexId)) return plan

  const newVertices = [
    ...(start.newVertex ? [start.newVertex] : []),
    ...(end.newVertex ? [end.newVertex] : []),
  ]

  const startRoom = findRoomByVertexId(plan, start.vertexId)
  const endRoom = findRoomByVertexId(plan, end.vertexId)
  const targetRoom = startRoom ?? endRoom

  let roomId: string
  let wallHeight = DEFAULT_WALL_HEIGHT
  let wallThickness = DEFAULT_WALL_THICKNESS
  let wallIds: string[]

  if (targetRoom) {
    roomId = targetRoom.id
    wallHeight = targetRoom.wallHeight
    wallThickness = targetRoom.wallThickness
    const wall = createPlanWall(roomId, start.vertexId, end.vertexId, wallHeight, wallThickness)
    wallIds = insertWallInChain(plan, targetRoom, wall.id, start.vertexId, end.vertexId)

    return {
      ...plan,
      vertices: [...plan.vertices, ...newVertices],
      walls: [...plan.walls, wall],
      rooms: plan.rooms.map((r) =>
        r.id === roomId ? { ...r, wallIds } : r,
      ),
    }
  }

  roomId = uuid()
  const wall = createPlanWall(roomId, start.vertexId, end.vertexId, wallHeight, wallThickness)
  const room: Room = {
    id: roomId,
    name: nextRoomName(plan.rooms),
    wallIds: [wall.id],
    wallHeight,
    wallThickness,
  }

  return {
    ...plan,
    vertices: [...plan.vertices, ...newVertices],
    walls: [...plan.walls, wall],
    rooms: [...plan.rooms, room],
  }
}

export function resizeRoomBoundingBox(
  plan: FloorPlan,
  roomId: string,
  targetWidth: number,
  targetDepth: number,
): FloorPlan {
  const room = getRoom(plan, roomId)
  if (!room) return plan

  const { width, depth } = roomBoundingSize(plan, room)
  if (width <= 0 || depth <= 0) return plan

  const tw = Math.max(MIN_WALL_LENGTH, snapToGrid(targetWidth))
  const td = Math.max(MIN_WALL_LENGTH, snapToGrid(targetDepth))
  const sx = tw / width
  const sy = td / depth
  if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return plan

  const centroid = roomCentroid(plan, room)
  const vertexIds = new Set(roomVertexIds(plan, room))

  return sanitizePlan({
    ...plan,
    vertices: plan.vertices.map((v) => {
      if (!vertexIds.has(v.id)) return v
      return {
        ...v,
        x: snapToGrid(centroid.x + (v.x - centroid.x) * sx),
        y: snapToGrid(centroid.y + (v.y - centroid.y) * sy),
      }
    }),
  })
}

export function updateRoomDefaults(
  plan: FloorPlan,
  roomId: string,
  patch: { wallHeight?: number; wallThickness?: number; name?: string },
): FloorPlan {
  const room = getRoom(plan, roomId)
  if (!room) return plan

  const wallHeight =
    patch.wallHeight !== undefined
      ? Math.min(20, Math.max(7, snapToGrid(patch.wallHeight)))
      : room.wallHeight
  const wallThickness = patch.wallThickness ?? room.wallThickness

  const wallIds = new Set(room.wallIds)
  return {
    ...plan,
    walls: plan.walls.map((w) =>
      wallIds.has(w.id)
        ? {
            ...w,
            height: patch.wallHeight !== undefined ? wallHeight : w.height,
            thickness: patch.wallThickness !== undefined ? wallThickness : w.thickness,
          }
        : w,
    ),
    rooms: plan.rooms.map((r) =>
      r.id === roomId
        ? {
            ...r,
            name: patch.name ?? r.name,
            wallHeight,
            wallThickness,
          }
        : r,
    ),
  }
}

export function wallDragCursor(wall: Wall): string {
  const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)
  const deg = ((angle * 180) / Math.PI + 180) % 180
  return deg < 45 || deg > 135 ? 'ns-resize' : 'ew-resize'
}

/** Migrate a legacy rectangle room (position/width/depth) into the plan model. */
export function migrateLegacyRectangleRoom(
  plan: FloorPlan,
  legacy: {
    id: string
    name: string
    position: Point2D
    width: number
    depth: number
    wallHeight: number
    wallThickness: number
    rotation?: number
  },
): FloorPlan {
  const c = snapPoint(legacy.position)
  const hw = legacy.width / 2
  const hd = legacy.depth / 2
  const rot = legacy.rotation ?? 0
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  const corners = local.map((p) => ({
    x: c.x + p.x * cos - p.y * sin,
    y: c.y + p.x * sin + p.y * cos,
  }))

  const roomId = legacy.id
  const vertices = corners.map((p) => createVertex(p))
  const walls = [
    createPlanWall(roomId, vertices[0].id, vertices[1].id, legacy.wallHeight, legacy.wallThickness),
    createPlanWall(roomId, vertices[1].id, vertices[2].id, legacy.wallHeight, legacy.wallThickness),
    createPlanWall(roomId, vertices[2].id, vertices[3].id, legacy.wallHeight, legacy.wallThickness),
    createPlanWall(roomId, vertices[3].id, vertices[0].id, legacy.wallHeight, legacy.wallThickness),
  ]

  const room: Room = {
    id: roomId,
    name: legacy.name,
    wallIds: walls.map((w) => w.id),
    wallHeight: legacy.wallHeight,
    wallThickness: legacy.wallThickness,
  }

  return {
    ...plan,
    vertices: [...plan.vertices, ...vertices],
    walls: [...plan.walls, ...walls],
    rooms: [...plan.rooms, room],
  }
}

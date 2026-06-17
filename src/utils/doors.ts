import { v4 as uuid } from 'uuid'
import type { Door, FloorPlan, Point2D, Wall } from '../types/floorPlan'
import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
} from '../types/floorPlan'
import { pointOnWall, projectOntoWall, wallAngle, wallLength } from './geometry'
import { snapToGrid } from './imperial'

export const DOOR_WALL_HIT_DISTANCE = 1.25
export const MIN_DOOR_WIDTH = 2
const DOOR_END_MARGIN = 0.25

export function isDoorId(plan: FloorPlan, id: string): boolean {
  return plan.doors.some((d) => d.id === id)
}

export function getDoor(plan: FloorPlan, id: string): Door | undefined {
  return plan.doors.find((d) => d.id === id)
}

export function doorsOnWall(plan: FloorPlan, wallId: string): Door[] {
  return plan.doors.filter((d) => d.wallId === wallId)
}

export function pruneDoors(plan: FloorPlan): FloorPlan {
  const wallIds = new Set(plan.walls.map((w) => w.id))
  return {
    ...plan,
    doors: plan.doors.filter((d) => wallIds.has(d.wallId)),
  }
}

export function clampDoorOffset(wall: Wall, width: number, offset: number): number {
  const len = wallLength(wall)
  const half = width / 2
  const min = half + DOOR_END_MARGIN
  const max = len - half - DOOR_END_MARGIN
  if (max < min) return len / 2
  return Math.max(min, Math.min(max, offset))
}

export function snapDoorOffset(offset: number): number {
  return snapToGrid(offset)
}

function doorsOverlap(a: Door, b: Door): boolean {
  if (a.wallId !== b.wallId) return false
  return Math.abs(a.offset - b.offset) < (a.width + b.width) / 2 - 0.01
}

function canPlaceDoor(wall: Wall, width: number, offset: number, existing: Door[]): boolean {
  const len = wallLength(wall)
  if (len < width + DOOR_END_MARGIN * 2) return false
  const candidate: Door = {
    id: 'temp',
    wallId: wall.id,
    offset,
    width,
    height: DEFAULT_DOOR_HEIGHT,
  }
  return !existing.some((d) => doorsOverlap(candidate, d))
}

export function wallSolidSegments(wall: Wall, doors: Door[]): { start: number; end: number }[] {
  const len = wallLength(wall)
  const gaps = doors
    .filter((d) => d.wallId === wall.id)
    .map((d) => ({
      start: Math.max(0, d.offset - d.width / 2),
      end: Math.min(len, d.offset + d.width / 2),
    }))
    .sort((a, b) => a.start - b.start)

  const segments: { start: number; end: number }[] = []
  let cursor = 0
  for (const gap of gaps) {
    if (gap.start > cursor + 0.01) {
      segments.push({ start: cursor, end: gap.start })
    }
    cursor = Math.max(cursor, gap.end)
  }
  if (len - cursor > 0.01) {
    segments.push({ start: cursor, end: len })
  }
  return segments
}

export function findNearestWall(
  walls: Wall[],
  point: Point2D,
  maxDist = DOOR_WALL_HIT_DISTANCE,
): { wall: Wall; offset: number; dist: number } | null {
  let best: { wall: Wall; offset: number; dist: number } | null = null
  for (const wall of walls) {
    const { offset, dist } = projectOntoWall(wall, point)
    if (dist < maxDist) {
      if (!best || dist < best.dist) {
        best = { wall, offset, dist }
      }
    }
  }
  return best
}

export function findDoorAtPoint(plan: FloorPlan, walls: Wall[], point: Point2D): Door | null {
  let best: Door | null = null
  let bestDist = DOOR_WALL_HIT_DISTANCE

  for (const door of plan.doors) {
    const wall = walls.find((w) => w.id === door.wallId)
    if (!wall) continue
    const { offset, dist } = projectOntoWall(wall, point)
    const half = door.width / 2
    if (offset >= door.offset - half && offset <= door.offset + half && dist < bestDist) {
      bestDist = dist
      best = door
    }
  }

  return best
}

export function addDoorAtPoint(
  plan: FloorPlan,
  walls: Wall[],
  point: Point2D,
  width = DEFAULT_DOOR_WIDTH,
): FloorPlan {
  const nearest = findNearestWall(walls, point)
  if (!nearest) return plan

  const offset = clampDoorOffset(
    nearest.wall,
    width,
    snapDoorOffset(nearest.offset),
  )
  const onWall = doorsOnWall(plan, nearest.wall.id)
  if (!canPlaceDoor(nearest.wall, width, offset, onWall)) return plan

  const door: Door = {
    id: uuid(),
    wallId: nearest.wall.id,
    offset,
    width,
    height: DEFAULT_DOOR_HEIGHT,
  }

  return { ...plan, doors: [...plan.doors, door] }
}

export function moveDoor(plan: FloorPlan, walls: Wall[], id: string, point: Point2D): FloorPlan {
  const door = getDoor(plan, id)
  if (!door) return plan

  const wall = walls.find((w) => w.id === door.wallId)
  if (!wall) return plan

  const { offset } = projectOntoWall(wall, point)
  const nextOffset = clampDoorOffset(wall, door.width, snapDoorOffset(offset))
  const others = plan.doors.filter((d) => d.id !== id && d.wallId === door.wallId)
  if (!canPlaceDoor(wall, door.width, nextOffset, others)) return plan

  return {
    ...plan,
    doors: plan.doors.map((d) => (d.id === id ? { ...d, offset: nextOffset } : d)),
  }
}

export function deleteDoor(plan: FloorPlan, id: string): FloorPlan {
  return { ...plan, doors: plan.doors.filter((d) => d.id !== id) }
}

export function normalizeDoorsList(raw: unknown): Door[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Door => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.wallId === 'string' &&
        typeof item.offset === 'number'
      )
    })
    .map((item) => ({
      id: item.id,
      wallId: item.wallId,
      offset: item.offset,
      width:
        typeof item.width === 'number' && item.width >= MIN_DOOR_WIDTH
          ? item.width
          : DEFAULT_DOOR_WIDTH,
      height:
        typeof item.height === 'number' && item.height > 0 ? item.height : DEFAULT_DOOR_HEIGHT,
    }))
}

/** Hinge point and swing arc for 2D plan symbols. */
export function doorSwingGeometry(
  wall: Wall,
  door: Door,
): { hinge: Point2D; leafEnd: Point2D; arcStart: number; arcEnd: number } {
  const hingeOffset = door.offset - door.width / 2
  const hinge = pointOnWall(wall, hingeOffset)
  const angle = wallAngle(wall)
  const swingAngle = angle + Math.PI / 2
  const leafEnd = {
    x: hinge.x + Math.cos(swingAngle) * door.width,
    y: hinge.y + Math.sin(swingAngle) * door.width,
  }
  return { hinge, leafEnd, arcStart: swingAngle, arcEnd: angle }
}

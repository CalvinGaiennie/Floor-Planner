import { v4 as uuid } from 'uuid'
import type { Door, DoorStyle, FloorPlan, Point2D, Wall } from '../types/floorPlan'
import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOUBLE_DOOR_WIDTH,
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
  options?: { width?: number; style?: DoorStyle },
): FloorPlan {
  const style = normalizeDoorStyle(options?.style)
  const width =
    options?.width ??
    (style === 'double' ? DEFAULT_DOUBLE_DOOR_WIDTH : DEFAULT_DOOR_WIDTH)
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
    swingMode: 0,
    style,
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

export function rotateDoorSwing(
  plan: FloorPlan,
  id: string,
  direction: 'cw' | 'ccw',
): FloorPlan {
  const door = getDoor(plan, id)
  if (!door) return plan
  const current = normalizeSwingMode(door.swingMode ?? 0)
  const delta = direction === 'cw' ? 1 : -1
  const swingMode = normalizeSwingMode(current + delta)
  return {
    ...plan,
    doors: plan.doors.map((d) => (d.id === id ? { ...d, swingMode } : d)),
  }
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
      swingMode: normalizeSwingMode(item.swingMode),
      style: normalizeDoorStyle(item.style),
    }))
}

function normalizeDoorStyle(value: unknown): DoorStyle {
  return value === 'double' ? 'double' : 'single'
}

export function doorStyleLabel(style: DoorStyle | undefined): string {
  return normalizeDoorStyle(style) === 'double' ? 'Double' : 'Single'
}

export function doorSwingLabel(door: Door): string {
  const style = normalizeDoorStyle(door.style)
  const { swingLeft } = swingParams(door.swingMode ?? 0)
  if (style === 'double') {
    return swingLeft ? 'Double · swings in' : 'Double · swings out'
  }
  switch (normalizeSwingMode(door.swingMode ?? 0)) {
    case 0:
      return 'Hinge at start'
    case 1:
      return 'Hinge at end'
    case 2:
      return 'Hinge at end, flip'
    case 3:
      return 'Hinge at start, flip'
    default:
      return 'Hinge at start'
  }
}

function normalizeSwingMode(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return ((Math.round(value) % 4) + 4) % 4
}

function swingParams(swingMode: number): { hingeAtStart: boolean; swingLeft: boolean } {
  const mode = normalizeSwingMode(swingMode)
  return {
    hingeAtStart: mode === 0 || mode === 3,
    swingLeft: mode === 0 || mode === 1,
  }
}

export interface DoorSwingArc {
  hinge: Point2D
  leafEnd: Point2D
  arcStart: number
  arcEnd: number
}

function singleSwingGeometry(wall: Wall, door: Door): DoorSwingArc {
  const { hingeAtStart, swingLeft } = swingParams(door.swingMode ?? 0)
  const hingeOffset = hingeAtStart
    ? door.offset - door.width / 2
    : door.offset + door.width / 2
  const jambOffset = hingeAtStart
    ? door.offset + door.width / 2
    : door.offset - door.width / 2
  const hinge = pointOnWall(wall, hingeOffset)
  const oppositeJamb = pointOnWall(wall, jambOffset)
  const angle = wallAngle(wall)
  const perpSign = swingLeft ? 1 : -1
  const swingAngle = angle + perpSign * (Math.PI / 2)
  const leafEnd = {
    x: hinge.x + Math.cos(swingAngle) * door.width,
    y: hinge.y + Math.sin(swingAngle) * door.width,
  }
  const jambAngle = Math.atan2(oppositeJamb.y - hinge.y, oppositeJamb.x - hinge.x)
  return { hinge, leafEnd, arcStart: swingAngle, arcEnd: jambAngle }
}

function doubleSwingGeometry(wall: Wall, door: Door): DoorSwingArc[] {
  const half = door.width / 2
  const { swingLeft } = swingParams(door.swingMode ?? 0)
  const perpSign = swingLeft ? 1 : -1
  const wallDir = wallAngle(wall)
  const leftHinge = pointOnWall(wall, door.offset - door.width / 2)
  const rightHinge = pointOnWall(wall, door.offset + door.width / 2)
  const center = pointOnWall(wall, door.offset)
  const sharedSwing = wallDir + perpSign * (Math.PI / 2)
  const leftLeafEnd = {
    x: leftHinge.x + Math.cos(sharedSwing) * half,
    y: leftHinge.y + Math.sin(sharedSwing) * half,
  }
  const rightLeafEnd = {
    x: rightHinge.x + Math.cos(sharedSwing) * half,
    y: rightHinge.y + Math.sin(sharedSwing) * half,
  }
  const centerFromLeft = Math.atan2(center.y - leftHinge.y, center.x - leftHinge.x)
  const centerFromRight = Math.atan2(center.y - rightHinge.y, center.x - rightHinge.x)
  return [
    { hinge: leftHinge, leafEnd: leftLeafEnd, arcStart: sharedSwing, arcEnd: centerFromLeft },
    { hinge: rightHinge, leafEnd: rightLeafEnd, arcStart: sharedSwing, arcEnd: centerFromRight },
  ]
}

/** Hinge point and swing arc(s) for 2D plan symbols. */
export function doorSwingGeometries(wall: Wall, door: Door): DoorSwingArc[] {
  if (normalizeDoorStyle(door.style) === 'double') {
    return doubleSwingGeometry(wall, door)
  }
  return [singleSwingGeometry(wall, door)]
}

/** @deprecated Use doorSwingGeometries */
export function doorSwingGeometry(wall: Wall, door: Door): DoorSwingArc {
  return singleSwingGeometry(wall, door)
}

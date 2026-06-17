import type { Point2D, Wall } from '../types/floorPlan'

export const ROTATE_STEP_RADIANS = Math.PI / 2

export function rotationDegrees(radians: number): number {
  const deg = (radians * 180) / Math.PI
  return Math.round(((deg % 360) + 360) % 360)
}

export function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}

export function wallLength(wall: Wall): number {
  return distance(wall.start, wall.end)
}

export function wallAngle(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)
}

export function wallMidpoint(wall: Wall): Point2D {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  }
}

export function pointOnWall(wall: Wall, offset: number): Point2D {
  const len = wallLength(wall)
  if (len === 0) return { ...wall.start }
  const t = offset / len
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}

export function distanceToSegment(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return distance(point, a)

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const proj = { x: a.x + t * dx, y: a.y + t * dy }
  return distance(point, proj)
}

export function projectOntoWall(wall: Wall, point: Point2D): { offset: number; dist: number } {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return { offset: 0, dist: distance(point, wall.start) }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / (len * len)),
  )
  const proj = {
    x: wall.start.x + t * dx,
    y: wall.start.y + t * dy,
  }
  return { offset: t * len, dist: distance(point, proj) }
}

export function isPointInsideFurniture(
  point: Point2D,
  center: Point2D,
  width: number,
  depth: number,
  rotation: number,
): boolean {
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)
  const dx = point.x - center.x
  const dy = point.y - center.y
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= depth / 2
}

/** Simple collision: block if within wall thickness of any wall segment */
export function canWalkTo(
  from: Point2D,
  to: Point2D,
  walls: Wall[],
  radius = 1,
): boolean {
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }
    for (const wall of walls) {
      if (distanceToSegment(point, wall.start, wall.end) < wall.thickness / 2 + radius) {
        return false
      }
    }
  }
  return true
}

import { FURNITURE_CATALOG, GRID_SIZE, type FloorPlan, type Point2D } from '../types/floorPlan'
import { orientedBoxCorners } from './geometry'
import { roomCorners } from './rooms'

export const PLAN_AREA_MAX_WIDTH = 360
export const PLAN_AREA_MAX_HEIGHT = 180
export const PIXELS_PER_FOOT = 24

export interface WorkspaceSize {
  width: number
  height: number
}

/** Fixed max plan workspace — always 360' wide × 180' tall. */
export const WORKSPACE_SIZE: WorkspaceSize = {
  width: PLAN_AREA_MAX_WIDTH,
  height: PLAN_AREA_MAX_HEIGHT,
}

/** Scale needed to fit the full workspace inside the container. */
export function computeFitScale(containerWidthPx: number, containerHeightPx: number): number {
  const padding = 0.92
  const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT
  const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT
  return Math.min(
    (containerWidthPx * padding) / workspacePxW,
    (containerHeightPx * padding) / workspacePxH,
  )
}

export const MAX_ZOOM_SCALE = 3

export function workspaceCenter(size: WorkspaceSize = WORKSPACE_SIZE) {
  return { x: size.width / 2, y: size.height / 2 }
}

export interface PlanBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const FIT_MARGIN_FT = 4
const MIN_BOUNDS_FT = 8

function boundsFromPoints(points: Point2D[]): PlanBounds | null {
  if (points.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  let width = maxX - minX
  let height = maxY - minY
  if (width < MIN_BOUNDS_FT) {
    const cx = (minX + maxX) / 2
    minX = cx - MIN_BOUNDS_FT / 2
    maxX = cx + MIN_BOUNDS_FT / 2
    width = MIN_BOUNDS_FT
  }
  if (height < MIN_BOUNDS_FT) {
    const cy = (minY + maxY) / 2
    minY = cy - MIN_BOUNDS_FT / 2
    maxY = cy + MIN_BOUNDS_FT / 2
    height = MIN_BOUNDS_FT
  }

  return {
    minX: Math.max(0, minX - FIT_MARGIN_FT),
    minY: Math.max(0, minY - FIT_MARGIN_FT),
    maxX: Math.min(WORKSPACE_SIZE.width, maxX + FIT_MARGIN_FT),
    maxY: Math.min(WORKSPACE_SIZE.height, maxY + FIT_MARGIN_FT),
  }
}

/** Bounding box of all rooms, furniture, and staircases. Returns null when the plan is empty. */
export function computePlanContentBounds(plan: FloorPlan): PlanBounds | null {
  const points: Point2D[] = []
  for (const room of plan.rooms) {
    points.push(...roomCorners(room))
  }
  for (const item of plan.furniture) {
    const cat = FURNITURE_CATALOG[item.type]
    points.push(...orientedBoxCorners(item.position, cat.width, cat.depth, item.rotation))
  }
  for (const stair of plan.staircases) {
    points.push(...orientedBoxCorners(stair.position, stair.width, stair.length, stair.rotation))
  }
  return boundsFromPoints(points)
}

/** Scale to fit a plan bounds rectangle inside the container. */
export function computeFitScaleForBounds(
  containerWidthPx: number,
  containerHeightPx: number,
  bounds: PlanBounds,
  padding = 0.88,
): number {
  const widthFt = bounds.maxX - bounds.minX
  const heightFt = bounds.maxY - bounds.minY
  if (widthFt <= 0 || heightFt <= 0) {
    return computeFitScale(containerWidthPx, containerHeightPx)
  }
  const widthPx = widthFt * PIXELS_PER_FOOT
  const heightPx = heightFt * PIXELS_PER_FOOT
  return Math.min(
    (containerWidthPx * padding) / widthPx,
    (containerHeightPx * padding) / heightPx,
  )
}

/** Pan offset so a plan point sits at the container center at the given scale. */
export function offsetToCenterPlanPoint(
  containerWidthPx: number,
  containerHeightPx: number,
  planPoint: Point2D,
  scale: number,
): Point2D {
  return {
    x: containerWidthPx / 2 - planPoint.x * PIXELS_PER_FOOT * scale,
    y: containerHeightPx / 2 - planPoint.y * PIXELS_PER_FOOT * scale,
  }
}

export { GRID_SIZE }

import { GRID_SIZE } from '../types/floorPlan'

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

export { GRID_SIZE }

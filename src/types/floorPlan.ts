export type Tool = 'select' | 'room' | 'delete'

export type ViewMode = 'plan2d' | 'view3d'

export interface Point2D {
  x: number
  y: number
}

export interface Room {
  id: string
  name: string
  /** Center position on the plan, in feet */
  position: Point2D
  width: number
  depth: number
  wallHeight: number
  wallThickness: number
  rotation: number
}

export interface Wall {
  id: string
  start: Point2D
  end: Point2D
  thickness: number
  height: number
}

export interface FloorPlan {
  name: string
  rooms: Room[]
}

export const DEFAULT_WALL_HEIGHT = 8
export const DEFAULT_WALL_THICKNESS = 0.25
export const GRID_SIZE = 0.5

export const DEFAULT_ROOM_WIDTH = 12
export const DEFAULT_ROOM_DEPTH = 10
export const MIN_ROOM_DIMENSION = 4
export const MAX_ROOM_DIMENSION = 80

export function createEmptyPlan(name = 'My Home'): FloorPlan {
  return {
    name,
    rooms: [],
  }
}

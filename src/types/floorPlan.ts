import type { FurnitureItem } from './furniture'

export type Tool = 'select' | 'room' | 'wall' | 'delete'

export type ViewMode = 'plan2d' | 'view3d'

export interface Point2D {
  x: number
  y: number
}

export interface Vertex {
  id: string
  x: number
  y: number
}

/** Wall segment stored in the plan; endpoints are vertex IDs. */
export interface PlanWall {
  id: string
  roomId: string
  startVertexId: string
  endVertexId: string
  height: number
  thickness: number
}

export interface Room {
  id: string
  name: string
  /** Ordered chain of wall IDs around the room perimeter */
  wallIds: string[]
  wallHeight: number
  wallThickness: number
}

/** Resolved wall segment for rendering and hit tests */
export interface Wall {
  id: string
  roomId: string
  start: Point2D
  end: Point2D
  thickness: number
  height: number
}

export interface FloorPlan {
  name: string
  notes: string
  vertices: Vertex[]
  walls: PlanWall[]
  rooms: Room[]
  furniture: FurnitureItem[]
}

export const DEFAULT_WALL_HEIGHT = 8
export const DEFAULT_WALL_THICKNESS = 0.25
export const GRID_SIZE = 0.5

export const DEFAULT_ROOM_WIDTH = 12
export const DEFAULT_ROOM_DEPTH = 10
export const MIN_WALL_LENGTH = 4
export const MAX_WALL_LENGTH = 80

export function createEmptyPlan(name = 'My Home'): FloorPlan {
  return {
    name,
    notes: '',
    vertices: [],
    walls: [],
    rooms: [],
    furniture: [],
  }
}

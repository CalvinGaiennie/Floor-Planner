import type { FurnitureItem } from './furniture'

export type Tool = 'select' | 'room' | 'wall' | 'door' | 'delete'

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

/** Door opening centered on a wall segment. */
export interface Door {
  id: string
  wallId: string
  /** Distance from wall start to door center along the wall. */
  offset: number
  width: number
  height: number
  /** 0–3: hinge side and swing direction around the wall. */
  swingMode?: number
}

export interface FloorPlan {
  name: string
  notes: string
  vertices: Vertex[]
  walls: PlanWall[]
  rooms: Room[]
  furniture: FurnitureItem[]
  doors: Door[]
}

export const DEFAULT_WALL_HEIGHT = 8
export const DEFAULT_WALL_THICKNESS = 0.25
export const GRID_SIZE = 0.5

export const DEFAULT_ROOM_WIDTH = 12
export const DEFAULT_ROOM_DEPTH = 10
export const MIN_WALL_LENGTH = 4
export const MAX_WALL_LENGTH = 80

export const DEFAULT_DOOR_WIDTH = 3
export const DEFAULT_DOOR_HEIGHT = 6.67

export function createEmptyPlan(name = 'My Home'): FloorPlan {
  return {
    name,
    notes: '',
    vertices: [],
    walls: [],
    rooms: [],
    furniture: [],
    doors: [],
  }
}

export type Tool =
  | 'select'
  | 'room'
  | 'door'
  | 'window'
  | 'furniture'
  | 'staircase'
  | 'delete'

export type ViewMode = 'plan2d' | 'view3d'

export type FurnitureType =
  | 'sofa'
  | 'bed'
  | 'dining-table'
  | 'chair'
  | 'desk'
  | 'dresser'
  | 'toilet'
  | 'tub'
  | 'fridge'
  | 'stove'

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

export interface Opening {
  id: string
  wallId: string
  type: 'door' | 'window'
  /** Distance from wall start, in feet */
  offset: number
  width: number
  height: number
  /** Sill height above floor, feet (windows only) */
  sillHeight: number
}

export interface FurnitureItem {
  id: string
  type: FurnitureType
  position: Point2D
  rotation: number
}

export interface Staircase {
  id: string
  position: Point2D
  rotation: number
  width: number
  length: number
  rise: number
}

export interface FloorPlan {
  name: string
  rooms: Room[]
  openings: Opening[]
  furniture: FurnitureItem[]
  staircases: Staircase[]
}

export interface FurnitureCatalogEntry {
  type: FurnitureType
  label: string
  width: number
  depth: number
  height: number
  color: string
}

export const FURNITURE_CATALOG: Record<FurnitureType, FurnitureCatalogEntry> = {
  sofa: { type: 'sofa', label: 'Sofa', width: 7, depth: 3, height: 3, color: '#6b7280' },
  bed: { type: 'bed', label: 'Bed', width: 6.5, depth: 6.5, height: 2.5, color: '#93c5fd' },
  'dining-table': {
    type: 'dining-table',
    label: 'Dining Table',
    width: 5,
    depth: 3,
    height: 2.5,
    color: '#92400e',
  },
  chair: { type: 'chair', label: 'Chair', width: 1.5, depth: 1.5, height: 3, color: '#78716c' },
  desk: { type: 'desk', label: 'Desk', width: 4, depth: 2, height: 2.5, color: '#a16207' },
  dresser: { type: 'dresser', label: 'Dresser', width: 4, depth: 1.5, height: 3, color: '#b45309' },
  toilet: { type: 'toilet', label: 'Toilet', width: 1.5, depth: 2.5, height: 2, color: '#e5e7eb' },
  tub: { type: 'tub', label: 'Bathtub', width: 2.5, depth: 5, height: 2, color: '#dbeafe' },
  fridge: { type: 'fridge', label: 'Fridge', width: 3, depth: 2.5, height: 6, color: '#d1d5db' },
  stove: { type: 'stove', label: 'Stove', width: 2.5, depth: 2.5, height: 3, color: '#374151' },
}

export const DEFAULT_WALL_HEIGHT = 8
export const DEFAULT_WALL_THICKNESS = 0.25
export const GRID_SIZE = 0.5
export const DOOR_WIDTH = 3
export const DOOR_HEIGHT = 6.67
export const WINDOW_WIDTH = 3
export const WINDOW_HEIGHT = 4
export const WINDOW_SILL = 3

export const DEFAULT_ROOM_WIDTH = 12
export const DEFAULT_ROOM_DEPTH = 10
export const MIN_ROOM_DIMENSION = 4
export const MAX_ROOM_DIMENSION = 80

export function createEmptyPlan(name = 'My Home'): FloorPlan {
  return {
    name,
    rooms: [],
    openings: [],
    furniture: [],
    staircases: [],
  }
}

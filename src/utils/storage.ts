import {
  createEmptyPlan,
  DEFAULT_ROOM_DEPTH,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  type FloorPlan,
  type Point2D,
  type Room,
} from '../types/floorPlan'
import { migrateLegacyRectangleRoom, sanitizePlan } from './planModel'

const STORAGE_KEY = 'floor-planner-plan-v2'

type LegacyRectangleRoom = {
  id: string
  name: string
  position?: Point2D
  width?: number
  depth?: number
  rotation?: number
  wallHeight?: number
  wallThickness?: number
  wallIds?: string[]
  closed?: boolean
  vertices?: Point2D[]
}

type LegacyPlan = {
  name?: string
  vertices?: unknown[]
  walls?: unknown[]
  rooms?: LegacyRectangleRoom[]
  openings?: unknown[]
  furniture?: unknown[]
  staircases?: unknown[]
}

function isNewFormatRoom(room: LegacyRectangleRoom): boolean {
  return Array.isArray(room.wallIds) && room.wallIds.length > 0
}

function normalizePlan(raw: LegacyPlan): FloorPlan {
  const base = createEmptyPlan(raw.name ?? 'My Home')

  if (
    Array.isArray(raw.vertices) &&
    Array.isArray(raw.walls) &&
    Array.isArray(raw.rooms) &&
    raw.rooms.length > 0 &&
    raw.rooms.every(isNewFormatRoom)
  ) {
    return sanitizePlan({
      name: raw.name ?? base.name,
      vertices: raw.vertices as FloorPlan['vertices'],
      walls: raw.walls as FloorPlan['walls'],
      rooms: raw.rooms as Room[],
    })
  }

  let plan = base
  if (Array.isArray(raw.rooms)) {
    for (const room of raw.rooms) {
      if (isNewFormatRoom(room)) continue

      if (
        room.position &&
        typeof room.position.x === 'number' &&
        typeof room.position.y === 'number' &&
        typeof room.width === 'number' &&
        typeof room.depth === 'number'
      ) {
        plan = migrateLegacyRectangleRoom(plan, {
          id: room.id,
          name: room.name ?? 'Room',
          position: room.position,
          width: room.width,
          depth: room.depth,
          rotation: room.rotation ?? 0,
          wallHeight: room.wallHeight ?? DEFAULT_WALL_HEIGHT,
          wallThickness: room.wallThickness ?? DEFAULT_WALL_THICKNESS,
        })
      } else if (room.vertices && room.vertices.length >= 3) {
        const xs = room.vertices.map((v) => v.x)
        const ys = room.vertices.map((v) => v.y)
        plan = migrateLegacyRectangleRoom(plan, {
          id: room.id,
          name: room.name ?? 'Room',
          position: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
          width: Math.max(Math.max(...xs) - Math.min(...xs), DEFAULT_ROOM_WIDTH),
          depth: Math.max(Math.max(...ys) - Math.min(...ys), DEFAULT_ROOM_DEPTH),
          rotation: 0,
          wallHeight: room.wallHeight ?? DEFAULT_WALL_HEIGHT,
          wallThickness: room.wallThickness ?? DEFAULT_WALL_THICKNESS,
        })
      }
    }
  }

  return sanitizePlan(plan)
}

export function savePlan(plan: FloorPlan): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
}

export function loadPlan(): FloorPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyPlan()
    return normalizePlan(JSON.parse(raw) as LegacyPlan)
  } catch {
    return createEmptyPlan()
  }
}

export function exportPlanJson(plan: FloorPlan): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${plan.name.replace(/\s+/g, '-').toLowerCase() || 'floor-plan'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function importPlanJson(file: File): Promise<FloorPlan> {
  return file.text().then((text) => normalizePlan(JSON.parse(text) as LegacyPlan))
}

export type { Room }

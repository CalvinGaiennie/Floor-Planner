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
import { normalizeFurnitureList } from './furniture'
import { normalizeDoorsList } from './doors'

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
  notes?: string
  vertices?: unknown[]
  walls?: unknown[]
  rooms?: LegacyRectangleRoom[]
  doors?: unknown[]
  openings?: unknown[]
  furniture?: unknown[]
  staircases?: unknown[]
}

function isNewFormatRoom(room: LegacyRectangleRoom): boolean {
  return Array.isArray(room.wallIds) && room.wallIds.length > 0
}

export function normalizePlanFromJson(data: unknown): FloorPlan {
  return normalizePlan(data as LegacyPlan)
}

function withDoors(plan: FloorPlan, raw: LegacyPlan): FloorPlan {
  return { ...plan, doors: normalizeDoorsList(raw.doors ?? raw.openings) }
}

function withFurniture(plan: FloorPlan, raw: LegacyPlan): FloorPlan {
  return withDoors({ ...plan, furniture: normalizeFurnitureList(raw.furniture) }, raw)
}

function normalizePlan(raw: LegacyPlan): FloorPlan {
  const base = withFurniture(createEmptyPlan(raw.name ?? 'My Home'), raw)
  if (typeof raw.notes === 'string') {
    base.notes = raw.notes
  }
  const hasWallGraph = Array.isArray(raw.vertices) && Array.isArray(raw.walls)

  if (
    hasWallGraph &&
    Array.isArray(raw.rooms) &&
    raw.rooms.length > 0 &&
    raw.rooms.every(isNewFormatRoom)
  ) {
    return sanitizePlan({
      name: raw.name ?? base.name,
      notes: typeof raw.notes === 'string' ? raw.notes : base.notes,
      vertices: raw.vertices as FloorPlan['vertices'],
      walls: raw.walls as FloorPlan['walls'],
      rooms: raw.rooms as Room[],
      furniture: base.furniture,
      doors: base.doors,
    })
  }

  let plan = base

  // Load wall-graph rooms even when mixed with legacy rooms or the fast path failed.
  if (hasWallGraph && Array.isArray(raw.rooms)) {
    const wallGraphRooms = raw.rooms.filter(isNewFormatRoom) as Room[]
    if (wallGraphRooms.length > 0) {
      plan = sanitizePlan({
        name: raw.name ?? base.name,
        notes: typeof raw.notes === 'string' ? raw.notes : base.notes,
        vertices: raw.vertices as FloorPlan['vertices'],
        walls: raw.walls as FloorPlan['walls'],
        rooms: wallGraphRooms,
        furniture: base.furniture,
        doors: base.doors,
      })
    }
  }

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

const MASTER_NOTE_KEY = 'floor-planner-master-note'

export function loadMasterNoteLocal(): string {
  try {
    return localStorage.getItem(MASTER_NOTE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveMasterNoteLocal(note: string): void {
  localStorage.setItem(MASTER_NOTE_KEY, note)
}

export interface PlanSummary {
  id: string
  name: string
  ownerId?: string
  ownerName?: string
  access?: 'owner' | 'view' | 'edit'
}

export function nextDefaultPlanName(existing: PlanSummary[]): string {
  const used = new Set(existing.map((p) => p.name))
  let i = existing.length + 1
  while (used.has(`Home ${i}`)) i += 1
  return `Home ${i}`
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

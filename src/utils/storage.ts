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
  notes?: string
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

export function normalizePlanFromJson(data: unknown): FloorPlan {
  return normalizePlan(data as LegacyPlan)
}

function withFurniture(plan: FloorPlan, raw: LegacyPlan): FloorPlan {
  return { ...plan, furniture: normalizeFurnitureList(raw.furniture) }
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

const ACTIVE_PLAN_ID_KEY = 'floor-planner-active-plan-id'
const PLANS_INDEX_KEY = 'floor-planner-plans-index'
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
}

function planStorageKey(planId: string) {
  return `${STORAGE_KEY}-${planId}`
}

function readPlansIndex(): PlanSummary[] {
  try {
    const raw = localStorage.getItem(PLANS_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlanSummary[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlansIndex(plans: PlanSummary[]) {
  localStorage.setItem(PLANS_INDEX_KEY, JSON.stringify(plans))
}

export function loadActivePlanIdLocal(): string | null {
  return localStorage.getItem(ACTIVE_PLAN_ID_KEY)
}

export function saveActivePlanIdLocal(planId: string) {
  localStorage.setItem(ACTIVE_PLAN_ID_KEY, planId)
}

export function savePlanForId(planId: string, plan: FloorPlan): void {
  localStorage.setItem(planStorageKey(planId), JSON.stringify(plan))
}

export function loadPlanForId(planId: string): FloorPlan | null {
  try {
    const raw = localStorage.getItem(planStorageKey(planId))
    if (!raw) return null
    return normalizePlan(JSON.parse(raw) as LegacyPlan)
  } catch {
    return null
  }
}

function migrateLegacyLocalStorage(): void {
  const index = readPlansIndex()
  if (index.length > 0) return

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const plan = normalizePlan(JSON.parse(raw) as LegacyPlan)
    const planId = crypto.randomUUID()
    savePlanForId(planId, plan)
    writePlansIndex([{ id: planId, name: plan.name }])
    saveActivePlanIdLocal(planId)
  } catch {
    // ignore
  }
}

export function nextDefaultPlanName(existing: PlanSummary[]): string {
  const used = new Set(existing.map((p) => p.name))
  let i = existing.length + 1
  while (used.has(`Home ${i}`)) i += 1
  return `Home ${i}`
}

export interface LocalPlansSession {
  plans: PlanSummary[]
  activePlanId: string
  plan: FloorPlan
}

export function mirrorCloudSessionLocally(session: LocalPlansSession): void {
  const previous = readPlansIndex()
  writePlansIndex(session.plans)
  saveActivePlanIdLocal(session.activePlanId)
  savePlanForId(session.activePlanId, session.plan)

  const cloudIds = new Set(session.plans.map((p) => p.id))
  for (const entry of previous) {
    if (!cloudIds.has(entry.id)) {
      localStorage.removeItem(planStorageKey(entry.id))
    }
  }
}

export function loadLocalPlansSession(): LocalPlansSession {
  migrateLegacyLocalStorage()
  let plans = readPlansIndex()

  if (plans.length === 0) {
    const plan = createEmptyPlan()
    const planId = crypto.randomUUID()
    savePlanForId(planId, plan)
    plans = [{ id: planId, name: plan.name }]
    writePlansIndex(plans)
    saveActivePlanIdLocal(planId)
    return { plans, activePlanId: planId, plan }
  }

  let activePlanId = loadActivePlanIdLocal()
  if (!activePlanId || !plans.some((p) => p.id === activePlanId)) {
    activePlanId = plans[0].id
    saveActivePlanIdLocal(activePlanId)
  }

  const plan = loadPlanForId(activePlanId) ?? createEmptyPlan(plans[0].name)
  return { plans, activePlanId, plan }
}

export function createLocalPlan(plan: FloorPlan): string {
  const plans = readPlansIndex()
  const planId = crypto.randomUUID()
  savePlanForId(planId, plan)
  plans.push({ id: planId, name: plan.name })
  writePlansIndex(plans)
  saveActivePlanIdLocal(planId)
  return planId
}

export function mirrorPlanLocally(planId: string, plan: FloorPlan): void {
  savePlanForId(planId, plan)
  const plans = readPlansIndex()
  if (!plans.some((p) => p.id === planId)) {
    writePlansIndex([...plans, { id: planId, name: plan.name }])
  }
  saveActivePlanIdLocal(planId)
}

export function deleteLocalPlan(planId: string): void {
  const plans = readPlansIndex().filter((p) => p.id !== planId)
  writePlansIndex(plans)
  localStorage.removeItem(planStorageKey(planId))
}

export function updateLocalPlanName(planId: string, name: string): void {
  const plans = readPlansIndex().map((p) => (p.id === planId ? { ...p, name } : p))
  writePlansIndex(plans)
}

export function savePlan(plan: FloorPlan): void {
  const activeId = loadActivePlanIdLocal()
  if (activeId) {
    savePlanForId(activeId, plan)
    updateLocalPlanName(activeId, plan.name)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
}

export function loadPlan(): FloorPlan {
  const session = loadLocalPlansSession()
  return session.plan
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

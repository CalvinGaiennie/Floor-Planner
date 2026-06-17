import { createEmptyPlan, DEFAULT_WALL_THICKNESS, type FloorPlan, type Room } from '../types/floorPlan'

const STORAGE_KEY = 'floor-planner-plan-v2'

type LegacyPlan = FloorPlan & { walls?: unknown[] }

function normalizePlan(raw: LegacyPlan): FloorPlan {
  const base = createEmptyPlan(raw.name ?? 'My Home')
  return {
    name: raw.name ?? base.name,
    rooms: Array.isArray(raw.rooms)
      ? raw.rooms.map((room) => ({ ...room, wallThickness: DEFAULT_WALL_THICKNESS }))
      : [],
    openings: Array.isArray(raw.openings) ? raw.openings : [],
    furniture: Array.isArray(raw.furniture) ? raw.furniture : [],
    staircases: Array.isArray(raw.staircases) ? raw.staircases : [],
  }
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

import type { FloorPlan } from '../types/floorPlan'
import { normalizePlanFromJson, type PlanSummary } from './storage'

const STORAGE_KEY = 'floor-planner-plan-v2'
const ACTIVE_PLAN_ID_KEY = 'floor-planner-active-plan-id'
const PLANS_INDEX_KEY = 'floor-planner-plans-index'

function planStorageKey(planId: string) {
  return `${STORAGE_KEY}-${planId}`
}

/** One-time read of plan data from legacy localStorage (before cloud-only persistence). */
export function readLegacyLocalPlansSession(): {
  plans: PlanSummary[]
  activePlanId: string
  planData: Map<string, FloorPlan>
} | null {
  try {
    const indexRaw = localStorage.getItem(PLANS_INDEX_KEY)
    let plans: PlanSummary[] = []
    if (indexRaw) {
      const parsed = JSON.parse(indexRaw) as PlanSummary[]
      if (Array.isArray(parsed) && parsed.length > 0) plans = parsed
    }

    if (plans.length === 0) {
      const legacyRaw = localStorage.getItem(STORAGE_KEY)
      if (!legacyRaw) return null
      const plan = normalizePlanFromJson(JSON.parse(legacyRaw))
      const planId = crypto.randomUUID()
      return {
        plans: [{ id: planId, name: plan.name }],
        activePlanId: planId,
        planData: new Map([[planId, plan]]),
      }
    }

    const planData = new Map<string, FloorPlan>()
    for (const summary of plans) {
      const raw = localStorage.getItem(planStorageKey(summary.id))
      if (!raw) continue
      planData.set(summary.id, normalizePlanFromJson(JSON.parse(raw)))
    }
    if (planData.size === 0) return null

    let activePlanId = localStorage.getItem(ACTIVE_PLAN_ID_KEY)
    if (!activePlanId || !planData.has(activePlanId)) {
      activePlanId = plans.find((p) => planData.has(p.id))?.id ?? plans[0].id
    }

    return { plans, activePlanId, planData }
  } catch {
    return null
  }
}

export function clearLegacyLocalPlans(): void {
  try {
    const indexRaw = localStorage.getItem(PLANS_INDEX_KEY)
    if (indexRaw) {
      const parsed = JSON.parse(indexRaw) as PlanSummary[]
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          localStorage.removeItem(planStorageKey(entry.id))
        }
      }
    }
    localStorage.removeItem(PLANS_INDEX_KEY)
    localStorage.removeItem(ACTIVE_PLAN_ID_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

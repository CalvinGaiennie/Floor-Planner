import { v4 as uuid } from 'uuid'
import { createEmptyPlan, type FloorPlan } from '../types/floorPlan'
import type { PlanSummary } from './storage'
import { nextDefaultPlanName } from './storage'

const planMap = new Map<string, FloorPlan>()
let summaries: PlanSummary[] = []
let activePlanId: string | null = null

export interface MemoryPlansSession {
  plans: PlanSummary[]
  activePlanId: string
  plan: FloorPlan
}

export function getMemoryPlansSession(): MemoryPlansSession {
  if (summaries.length === 0) {
    const plan = createEmptyPlan()
    const planId = uuid()
    planMap.set(planId, plan)
    summaries = [{ id: planId, name: plan.name }]
    activePlanId = planId
  }

  if (!activePlanId || !summaries.some((p) => p.id === activePlanId)) {
    activePlanId = summaries[0].id
  }

  const plan = planMap.get(activePlanId) ?? createEmptyPlan(summaries[0].name)
  planMap.set(activePlanId, plan)

  return { plans: summaries, activePlanId, plan }
}

export function saveMemoryPlan(planId: string, plan: FloorPlan): void {
  planMap.set(planId, plan)
  summaries = summaries.map((p) => (p.id === planId ? { ...p, name: plan.name } : p))
}

export function loadMemoryPlan(planId: string): FloorPlan | null {
  return planMap.get(planId) ?? null
}

export function createMemoryPlan(plan: FloorPlan): string {
  const planId = uuid()
  planMap.set(planId, plan)
  summaries.push({ id: planId, name: plan.name })
  activePlanId = planId
  return planId
}

export function deleteMemoryPlan(planId: string): void {
  planMap.delete(planId)
  summaries = summaries.filter((p) => p.id !== planId)
}

export function setMemoryActivePlanId(planId: string): void {
  activePlanId = planId
}

export function createMemoryPlanWithDefaultName(): { planId: string; plan: FloorPlan } {
  const name = nextDefaultPlanName(summaries)
  const plan = createEmptyPlan(name)
  const planId = createMemoryPlan(plan)
  return { planId, plan }
}

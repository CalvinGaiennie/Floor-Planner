import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { v4 as uuid } from 'uuid'
import type { FloorPlan } from '../types/floorPlan'
import { createEmptyPlan } from '../types/floorPlan'
import { db, isFirebaseConfigured } from '../lib/firebase'
import {
  loadLocalPlansSession,
  loadPlanForId,
  mirrorCloudSessionLocally,
  normalizePlanFromJson,
  type PlanSummary,
} from '../utils/storage'

export type { PlanSummary }

const SETTINGS_DOC_ID = 'settings'
const LEGACY_PLAN_DOC_ID = 'plan'

function settingsRef(userId: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'users', userId, 'data', SETTINGS_DOC_ID)
}

function planRef(userId: string, planId: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'users', userId, 'plans', planId)
}

function plansCollection(userId: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return collection(db, 'users', userId, 'plans')
}

function summaryFromDoc(id: string, data: Record<string, unknown>): PlanSummary {
  const plan = data.plan as FloorPlan | undefined
  return { id, name: plan?.name?.trim() || 'Untitled' }
}

export async function migrateLegacyPlanIfNeeded(userId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  const plansSnap = await getDocs(plansCollection(userId))
  if (plansSnap.size > 0) return

  const legacyRef = doc(db, 'users', userId, 'data', LEGACY_PLAN_DOC_ID)
  const legacySnap = await getDoc(legacyRef)
  if (!legacySnap.exists()) return

  const legacyPlan = legacySnap.data().plan
  if (!legacyPlan) return

  const planId = uuid()
  const plan = normalizePlanFromJson(legacyPlan)
  await setDoc(planRef(userId, planId), {
    plan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await setDoc(settingsRef(userId), { activePlanId: planId }, { merge: true })
}

export async function listPlansFromFirestore(userId: string): Promise<PlanSummary[]> {
  if (!isFirebaseConfigured() || !db) return []

  await migrateLegacyPlanIfNeeded(userId)
  const snap = await getDocs(plansCollection(userId))
  return snap.docs.map((d) => summaryFromDoc(d.id, d.data()))
}

export async function getActivePlanIdFromFirestore(userId: string): Promise<string | null> {
  if (!isFirebaseConfigured() || !db) return null

  const snap = await getDoc(settingsRef(userId))
  const id = snap.data()?.activePlanId
  return typeof id === 'string' ? id : null
}

export async function setActivePlanIdInFirestore(userId: string, planId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  await setDoc(settingsRef(userId), { activePlanId: planId }, { merge: true })
}

export async function loadMasterNoteFromFirestore(userId: string): Promise<string> {
  if (!isFirebaseConfigured() || !db) return ''

  const snap = await getDoc(settingsRef(userId))
  const note = snap.data()?.masterNote
  return typeof note === 'string' ? note : ''
}

export async function saveMasterNoteToFirestore(userId: string, masterNote: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  await setDoc(settingsRef(userId), { masterNote }, { merge: true })
}

export async function loadPlanFromFirestore(
  userId: string,
  planId: string,
): Promise<FloorPlan | null> {
  if (!isFirebaseConfigured() || !db) return null

  const snap = await getDoc(planRef(userId, planId))
  if (!snap.exists()) return null

  const data = snap.data()
  if (!data.plan) return null

  return normalizePlanFromJson(data.plan)
}

export async function savePlanToFirestore(
  userId: string,
  planId: string,
  plan: FloorPlan,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  await setDoc(
    planRef(userId, planId),
    {
      plan,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function createPlanInFirestore(userId: string, plan: FloorPlan): Promise<string> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firestore is not initialized')

  const planId = uuid()
  await setDoc(planRef(userId, planId), {
    plan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await setActivePlanIdInFirestore(userId, planId)
  return planId
}

export async function deletePlanFromFirestore(userId: string, planId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  await deleteDoc(planRef(userId, planId))
}

export interface UserPlansSession {
  plans: PlanSummary[]
  activePlanId: string
  plan: FloorPlan
}

async function uploadLocalSessionToFirestore(userId: string): Promise<UserPlansSession> {
  const local = loadLocalPlansSession()

  for (const summary of local.plans) {
    const plan = loadPlanForId(summary.id) ?? createEmptyPlan(summary.name)
    const existing = await getDoc(planRef(userId, summary.id))
    await setDoc(
      planRef(userId, summary.id),
      {
        plan,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  const activePlanId = local.plans.some((p) => p.id === local.activePlanId)
    ? local.activePlanId
    : local.plans[0].id

  await setActivePlanIdInFirestore(userId, activePlanId)
  const plans = await listPlansFromFirestore(userId)
  const plan =
    (await loadPlanFromFirestore(userId, activePlanId)) ?? createEmptyPlan(plans[0]?.name)

  return { plans, activePlanId, plan }
}

export async function loadUserPlansSession(userId: string): Promise<UserPlansSession> {
  await migrateLegacyPlanIfNeeded(userId)
  let plans = await listPlansFromFirestore(userId)

  if (plans.length === 0) {
    const session = await uploadLocalSessionToFirestore(userId)
    mirrorCloudSessionLocally(session)
    return session
  }

  let activePlanId = await getActivePlanIdFromFirestore(userId)
  if (!activePlanId || !plans.some((p) => p.id === activePlanId)) {
    activePlanId = plans[0].id
    await setActivePlanIdInFirestore(userId, activePlanId)
  }

  const plan =
    (await loadPlanFromFirestore(userId, activePlanId)) ?? createEmptyPlan(plans[0].name)

  const session = { plans, activePlanId, plan }
  mirrorCloudSessionLocally(session)
  return session
}

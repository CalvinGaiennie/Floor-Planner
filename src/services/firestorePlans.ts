import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { v4 as uuid } from 'uuid'
import type { FloorPlan } from '../types/floorPlan'
import { createEmptyPlan } from '../types/floorPlan'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { clearLegacyLocalPlans, readLegacyLocalPlansSession } from '../utils/legacyLocalMigration'
import { normalizePlanFromJson, type PlanSummary } from '../utils/storage'
import { listFriends } from './firestoreFriends'

export type { PlanSummary }
export type PlanAccess = 'owner' | 'view' | 'edit'

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

function planEditorsFromData(data: Record<string, unknown>): string[] {
  const editors = data.editors
  if (!Array.isArray(editors)) return []
  return editors.filter((e): e is string => typeof e === 'string')
}

export async function getPlanEditors(ownerId: string, planId: string): Promise<string[]> {
  if (!isFirebaseConfigured() || !db) return []

  const snap = await getDoc(planRef(ownerId, planId))
  if (!snap.exists()) return []
  return planEditorsFromData(snap.data())
}

export async function addPlanEditor(
  ownerId: string,
  planId: string,
  editorUid: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  const snap = await getDoc(planRef(ownerId, planId))
  if (!snap.exists()) return

  const editors = new Set(planEditorsFromData(snap.data()))
  editors.add(editorUid)
  await setDoc(
    planRef(ownerId, planId),
    { editors: [...editors], updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function getPlanAccess(
  ownerId: string,
  planId: string,
  viewerUid: string,
): Promise<PlanAccess | null> {
  if (!isFirebaseConfigured() || !db) return null

  if (ownerId === viewerUid) return 'owner'

  const friends = await listFriends(viewerUid)
  if (!friends.some((f) => f.friendUid === ownerId)) return null

  const editors = await getPlanEditors(ownerId, planId)
  if (editors.includes(viewerUid)) return 'edit'
  return 'view'
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

async function migrateLegacyBrowserStorageToFirestore(userId: string): Promise<boolean> {
  const legacy = readLegacyLocalPlansSession()
  if (!legacy) return false

  for (const summary of legacy.plans) {
    const plan = legacy.planData.get(summary.id)
    if (!plan) continue
    await setDoc(planRef(userId, summary.id), {
      plan,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const activePlanId = legacy.plans.some((p) => p.id === legacy.activePlanId)
    ? legacy.activePlanId
    : legacy.plans[0].id

  await setDoc(settingsRef(userId), { activePlanId }, { merge: true })
  clearLegacyLocalPlans()
  return true
}

export async function listPlansFromFirestore(userId: string): Promise<PlanSummary[]> {
  if (!isFirebaseConfigured() || !db) return []

  await migrateLegacyPlanIfNeeded(userId)
  const snap = await getDocs(plansCollection(userId))
  return snap.docs.map((d) => summaryFromDoc(d.id, d.data()))
}

async function listPlansFromServer(userId: string): Promise<PlanSummary[]> {
  if (!isFirebaseConfigured() || !db) return []

  await migrateLegacyPlanIfNeeded(userId)
  try {
    const snap = await getDocsFromServer(plansCollection(userId))
    return snap.docs.map((d) => summaryFromDoc(d.id, d.data()))
  } catch {
    const snap = await getDocs(plansCollection(userId))
    return snap.docs.map((d) => summaryFromDoc(d.id, d.data()))
  }
}

export async function getActivePlanIdFromFirestore(userId: string): Promise<string | null> {
  if (!isFirebaseConfigured() || !db) return null

  const snap = await getDoc(settingsRef(userId))
  const id = snap.data()?.activePlanId
  return typeof id === 'string' ? id : null
}

async function getActivePlanIdFromServer(userId: string): Promise<string | null> {
  if (!isFirebaseConfigured() || !db) return null

  try {
    const snap = await getDocFromServer(settingsRef(userId))
    const id = snap.data()?.activePlanId
    return typeof id === 'string' ? id : null
  } catch {
    const snap = await getDoc(settingsRef(userId))
    const id = snap.data()?.activePlanId
    return typeof id === 'string' ? id : null
  }
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

async function loadPlanFromServer(userId: string, planId: string): Promise<FloorPlan | null> {
  if (!isFirebaseConfigured() || !db) return null

  try {
    const snap = await getDocFromServer(planRef(userId, planId))
    if (!snap.exists()) return null
    const data = snap.data()
    if (!data.plan) return null
    return normalizePlanFromJson(data.plan)
  } catch {
    const snap = await getDoc(planRef(userId, planId))
    if (!snap.exists()) return null
    const data = snap.data()
    if (!data.plan) return null
    return normalizePlanFromJson(data.plan)
  }
}

/** Load a plan directly from Firestore servers (bypasses local cache). */
export async function loadPlanFromFirestoreServer(
  userId: string,
  planId: string,
): Promise<FloorPlan | null> {
  return loadPlanFromServer(userId, planId)
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
    editors: [],
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

async function createDefaultCloudSession(userId: string): Promise<UserPlansSession> {
  const plan = createEmptyPlan()
  const planId = await createPlanInFirestore(userId, plan)
  return {
    plans: [{ id: planId, name: plan.name }],
    activePlanId: planId,
    plan,
  }
}

export async function loadUserPlansSession(userId: string): Promise<UserPlansSession> {
  await migrateLegacyPlanIfNeeded(userId)
  let plans = await listPlansFromServer(userId)

  if (plans.length === 0) {
    const migrated = await migrateLegacyBrowserStorageToFirestore(userId)
    if (migrated) {
      plans = await listPlansFromServer(userId)
    }
  }

  if (plans.length === 0) {
    return createDefaultCloudSession(userId)
  }

  let activePlanId = await getActivePlanIdFromServer(userId)
  if (!activePlanId || !plans.some((p) => p.id === activePlanId)) {
    activePlanId = plans[0].id
    await setActivePlanIdInFirestore(userId, activePlanId)
  }

  const plan =
    (await loadPlanFromServer(userId, activePlanId)) ?? createEmptyPlan(plans[0].name)

  return { plans, activePlanId, plan }
}

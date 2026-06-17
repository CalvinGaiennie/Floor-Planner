import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { v4 as uuid } from 'uuid'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { addPlanEditor } from './firestorePlans'

export interface FriendRecord {
  friendUid: string
  friendEmail: string
  friendDisplayName: string
  connectedAt?: unknown
}

export interface IncomingFriendRequest {
  fromUid: string
  fromEmail: string
  fromDisplayName: string
  createdAt?: unknown
}

export interface CollaborateRequest {
  id: string
  planId: string
  planName: string
  fromUid: string
  fromDisplayName: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt?: unknown
}

function incomingFriendRequestRef(toUid: string, fromUid: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'users', toUid, 'incomingFriendRequests', fromUid)
}

function friendRef(uid: string, friendUid: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'users', uid, 'friends', friendUid)
}

function collaborateRequestsCollection(ownerId: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return collection(db, 'users', ownerId, 'collaborateRequests')
}

function collaborateRequestRef(ownerId: string, requestId: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'users', ownerId, 'collaborateRequests', requestId)
}

export async function sendFriendRequest(
  fromUid: string,
  fromEmail: string,
  fromDisplayName: string,
  toUid: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  if (fromUid === toUid) throw new Error('You cannot friend yourself')

  await setDoc(incomingFriendRequestRef(toUid, fromUid), {
    fromUid,
    fromEmail,
    fromDisplayName,
    createdAt: serverTimestamp(),
  })
}

export async function listIncomingFriendRequests(
  uid: string,
): Promise<IncomingFriendRequest[]> {
  if (!isFirebaseConfigured() || !db) return []

  const snap = await getDocs(
    collection(db, 'users', uid, 'incomingFriendRequests'),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      fromUid: d.id,
      fromEmail: typeof data.fromEmail === 'string' ? data.fromEmail : '',
      fromDisplayName:
        typeof data.fromDisplayName === 'string' ? data.fromDisplayName : 'User',
      createdAt: data.createdAt,
    }
  })
}

export async function acceptFriendRequest(
  uid: string,
  fromUid: string,
  fromEmail: string,
  fromDisplayName: string,
  selfEmail: string,
  selfDisplayName: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  await setDoc(friendRef(uid, fromUid), {
    friendUid: fromUid,
    friendEmail: fromEmail,
    friendDisplayName: fromDisplayName,
    connectedAt: serverTimestamp(),
  })
  await setDoc(friendRef(fromUid, uid), {
    friendUid: uid,
    friendEmail: selfEmail,
    friendDisplayName: selfDisplayName,
    connectedAt: serverTimestamp(),
  })
  await deleteDoc(incomingFriendRequestRef(uid, fromUid))
}

export async function declineFriendRequest(uid: string, fromUid: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  await deleteDoc(incomingFriendRequestRef(uid, fromUid))
}

export async function listFriends(uid: string): Promise<FriendRecord[]> {
  if (!isFirebaseConfigured() || !db) return []

  const snap = await getDocs(collection(db, 'users', uid, 'friends'))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      friendUid: d.id,
      friendEmail: typeof data.friendEmail === 'string' ? data.friendEmail : '',
      friendDisplayName:
        typeof data.friendDisplayName === 'string' ? data.friendDisplayName : 'Friend',
      connectedAt: data.connectedAt,
    }
  })
}

export async function sendCollaborateRequest(
  ownerId: string,
  planId: string,
  planName: string,
  fromUid: string,
  fromDisplayName: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  const requestId = uuid()
  await setDoc(collaborateRequestRef(ownerId, requestId), {
    planId,
    planName,
    fromUid,
    fromDisplayName,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

export async function listCollaborateRequests(ownerId: string): Promise<CollaborateRequest[]> {
  if (!isFirebaseConfigured() || !db) return []

  const snap = await getDocs(collaborateRequestsCollection(ownerId))
  const results: CollaborateRequest[] = []
  for (const d of snap.docs) {
    const data = d.data()
    const status = data.status
    if (status !== 'pending') continue
    results.push({
      id: d.id,
      planId: typeof data.planId === 'string' ? data.planId : '',
      planName: typeof data.planName === 'string' ? data.planName : 'Plan',
      fromUid: typeof data.fromUid === 'string' ? data.fromUid : '',
      fromDisplayName:
        typeof data.fromDisplayName === 'string' ? data.fromDisplayName : 'User',
      status: 'pending',
      createdAt: data.createdAt,
    })
  }
  return results
}

export async function listMyPendingCollaborateRequests(
  ownerId: string,
  fromUid: string,
): Promise<CollaborateRequest[]> {
  if (!isFirebaseConfigured() || !db) return []

  const snap = await getDocs(collaborateRequestsCollection(ownerId))
  const results: CollaborateRequest[] = []
  for (const d of snap.docs) {
    const data = d.data()
    if (data.fromUid !== fromUid || data.status !== 'pending') continue
    results.push({
      id: d.id,
      planId: typeof data.planId === 'string' ? data.planId : '',
      planName: typeof data.planName === 'string' ? data.planName : 'Plan',
      fromUid,
      fromDisplayName:
        typeof data.fromDisplayName === 'string' ? data.fromDisplayName : 'User',
      status: 'pending',
      createdAt: data.createdAt,
    })
  }
  return results
}

export async function acceptCollaborateRequest(
  ownerId: string,
  requestId: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return

  const ref = collaborateRequestRef(ownerId, requestId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data()
  const planId = typeof data.planId === 'string' ? data.planId : ''
  const fromUid = typeof data.fromUid === 'string' ? data.fromUid : ''
  if (!planId || !fromUid) return

  await addPlanEditor(ownerId, planId, fromUid)
  await updateDoc(ref, { status: 'accepted' })
}

export async function declineCollaborateRequest(
  ownerId: string,
  requestId: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  await updateDoc(collaborateRequestRef(ownerId, requestId), { status: 'declined' })
}

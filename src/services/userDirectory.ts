import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../lib/firebase'

export interface DirectoryUser {
  uid: string
  email: string
  displayName: string
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function directoryRef(emailKey: string) {
  if (!db) throw new Error('Firestore is not initialized')
  return doc(db, 'directory', emailKey)
}

export async function registerUserDirectory(
  uid: string,
  email: string,
  displayName: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !db || !email) return

  const emailKey = normalizeEmail(email)
  await setDoc(
    directoryRef(emailKey),
    {
      uid,
      email: emailKey,
      displayName: displayName.trim() || emailKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function findUserByEmail(email: string): Promise<DirectoryUser | null> {
  if (!isFirebaseConfigured() || !db) return null

  const emailKey = normalizeEmail(email)
  if (!emailKey.includes('@')) return null

  const snap = await getDoc(directoryRef(emailKey))
  if (!snap.exists()) return null

  const data = snap.data()
  const uid = data.uid
  if (typeof uid !== 'string') return null

  return {
    uid,
    email: typeof data.email === 'string' ? data.email : emailKey,
    displayName:
      typeof data.displayName === 'string' ? data.displayName : emailKey,
  }
}

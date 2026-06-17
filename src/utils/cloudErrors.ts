export type CloudOperation =
  | 'load-session'
  | 'save'
  | 'switch-plan'
  | 'delete-plan'
  | 'missing-plan'

export interface CloudSyncAlert {
  operation: CloudOperation
  message: string
  firebaseCode?: string
  firebaseMessage?: string
  timestamp: number
  planId?: string
}

export interface AuthAlert {
  message: string
  firebaseCode?: string
}

export function parseFirebaseError(err: unknown): { code?: string; message: string } {
  if (err && typeof err === 'object') {
    const record = err as { code?: unknown; message?: unknown }
    const code = typeof record.code === 'string' ? record.code : undefined
    const message =
      typeof record.message === 'string' && record.message.trim()
        ? record.message
        : undefined
    if (code || message) {
      return { code, message: message ?? code ?? 'Unknown error' }
    }
  }
  if (err instanceof Error && err.message) {
    return { message: err.message }
  }
  if (typeof err === 'string' && err.trim()) {
    return { message: err }
  }
  return { message: 'Unknown error' }
}

export function cloudAlertTitle(operation: CloudOperation): string {
  switch (operation) {
    case 'load-session':
      return 'Cloud load failed'
    case 'save':
      return 'Cloud save failed'
    case 'switch-plan':
      return 'Could not open plan'
    case 'delete-plan':
      return 'Cloud delete failed'
    case 'missing-plan':
      return 'Plan not found'
    default:
      return 'Cloud error'
  }
}

const OPERATION_LABELS: Record<CloudOperation, string> = {
  'load-session': 'Load plans on startup',
  save: 'Save plan',
  'switch-plan': 'Switch plan',
  'delete-plan': 'Delete plan',
  'missing-plan': 'Open plan',
}

export function buildAlertDiagnostics(params: {
  signedIn: boolean
  userEmail?: string | null
  browserOnline: boolean
  projectId?: string | null
  operation?: CloudOperation
  planId?: string
  firebaseCode?: string
  firebaseMessage?: string
  timestamp?: number
}): string {
  const lines: string[] = []

  lines.push(`Signed in: ${params.signedIn ? `yes (${params.userEmail ?? 'account'})` : 'no'}`)
  lines.push(`Browser online: ${params.browserOnline ? 'yes' : 'no'}`)

  if (params.projectId) {
    lines.push(`Firebase project: ${params.projectId}`)
  }

  if (params.operation) {
    lines.push(`Operation: ${OPERATION_LABELS[params.operation]}`)
  }

  if (params.planId) {
    lines.push(`Plan ID: ${params.planId}`)
  }

  if (params.timestamp) {
    lines.push(`Time: ${new Date(params.timestamp).toLocaleString()}`)
  }

  if (params.firebaseCode) {
    lines.push(`Firebase code: ${params.firebaseCode}`)
  }

  if (params.firebaseMessage) {
    lines.push(`Firebase message: ${params.firebaseMessage}`)
  }

  const hints: string[] = []

  if (!params.signedIn) {
    hints.push('Sign in from the account menu to use cloud sync.')
  } else if (params.firebaseCode === 'auth/popup-closed-by-user') {
    hints.push('The Google sign-in window was closed before finishing.')
  } else if (!params.browserOnline) {
    hints.push('Your browser reports offline. Reconnect, then edit the plan to retry.')
  } else if (params.firebaseCode === 'permission-denied') {
    hints.push('Firestore denied this request. Check security rules for your Firebase project.')
  } else if (params.firebaseCode === 'unavailable') {
    hints.push('Firebase could not be reached. Try again in a moment.')
  } else if (params.operation === 'missing-plan') {
    hints.push('The plan may have been deleted elsewhere. Pick another plan or create a new one.')
  } else if (params.operation === 'save') {
    hints.push('Make another edit after the issue is resolved. A successful save clears this alert.')
  } else if (params.operation === 'load-session') {
    hints.push('Refresh after fixing the issue. Export from the account menu if you need a backup.')
  }

  if (hints.length > 0) {
    lines.push('', hints.join(' '))
  }

  return lines.join('\n')
}

export function logCloudError(operation: CloudOperation, err: unknown, context?: Record<string, unknown>) {
  const parsed = parseFirebaseError(err)
  console.error('[cloud]', operation, { ...parsed, ...context }, err)
}

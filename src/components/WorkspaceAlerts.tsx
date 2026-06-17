import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFloorPlan } from '../context/FloorPlanContext'
import {
  buildAlertDiagnostics,
  cloudAlertTitle,
  type CloudSyncAlert,
} from '../utils/cloudErrors'

const ALERTS_OPEN_KEY = 'floor-planner-alerts-open'

interface WorkspaceAlert {
  id: string
  title: string
  message: string
  details?: string
}

function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}

function buildAlerts(
  firebaseEnabled: boolean,
  signedIn: boolean,
  userEmail: string | null | undefined,
  browserOnline: boolean,
  projectId: string | null,
  authError: { message: string; firebaseCode?: string } | null,
  cloudAlert: CloudSyncAlert | null,
): WorkspaceAlert[] {
  const alerts: WorkspaceAlert[] = []

  if (!firebaseEnabled) {
    alerts.push({
      id: 'firebase-disabled',
      title: 'Cloud sync disabled',
      message: 'Cloud sync disabled — set VITE_FIREBASE_* env vars and redeploy.',
      details:
        'This build is missing Firebase configuration. Add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID, and related vars to your hosting environment, then redeploy. Until then, plans are not saved to the cloud.',
    })
  }

  if (authError) {
    alerts.push({
      id: 'auth',
      title: 'Sign-in failed',
      message: authError.message,
      details: buildAlertDiagnostics({
        signedIn,
        userEmail,
        browserOnline,
        projectId,
        firebaseCode: authError.firebaseCode,
        firebaseMessage: authError.message,
      }),
    })
  }

  if (cloudAlert) {
    alerts.push({
      id: 'sync',
      title: cloudAlertTitle(cloudAlert.operation),
      message: cloudAlert.message,
      details: buildAlertDiagnostics({
        signedIn,
        userEmail,
        browserOnline,
        projectId,
        operation: cloudAlert.operation,
        planId: cloudAlert.planId,
        firebaseCode: cloudAlert.firebaseCode,
        firebaseMessage: cloudAlert.firebaseMessage,
        timestamp: cloudAlert.timestamp,
      }),
    })
  }

  return alerts
}

function AlertsIcon() {
  return (
    <svg
      className="workspace-alerts-fab-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CollapsibleAlert({
  alert,
  expanded,
  onToggle,
}: {
  alert: WorkspaceAlert
  expanded: boolean
  onToggle: () => void
}) {
  const hasDetails = Boolean(alert.details)

  return (
    <div className={`workspace-alert-item${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="workspace-alert-item-header"
        onClick={hasDetails ? onToggle : undefined}
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
      >
        <span className="workspace-alert-item-title">{alert.title}</span>
        {hasDetails && (
          <span className="workspace-alert-item-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      <p className="workspace-alert-item-message">{alert.message}</p>
      {hasDetails && expanded && (
        <pre className="workspace-alert-item-details">{alert.details}</pre>
      )}
    </div>
  )
}

export function WorkspaceAlerts() {
  const { cloudAlert, firebaseProjectId } = useFloorPlan()
  const { user, firebaseEnabled, authError } = useAuth()
  const browserOnline = useBrowserOnline()
  const [open, setOpen] = useState(() => localStorage.getItem(ALERTS_OPEN_KEY) === '1')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const alerts = buildAlerts(
    firebaseEnabled,
    Boolean(user),
    user?.email,
    browserOnline,
    firebaseProjectId,
    authError,
    cloudAlert,
  )

  useEffect(() => {
    localStorage.setItem(ALERTS_OPEN_KEY, open ? '1' : '0')
  }, [open])

  if (alerts.length === 0) return null

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="workspace-alerts-root">
      <button
        type="button"
        className={`workspace-alerts-fab${open ? ' hidden' : ''}`}
        aria-label={`${alerts.length} alert${alerts.length === 1 ? '' : 's'}. Open alerts.`}
        title="Alerts — click to open"
        onClick={() => setOpen(true)}
      >
        <AlertsIcon />
        <span className="workspace-alerts-fab-badge" aria-hidden="true">{alerts.length}</span>
      </button>

      {open && (
        <aside className="workspace-alerts-panel" aria-label="Alerts">
          <header className="workspace-alerts-header">
            <h2>Alerts</h2>
            <button
              type="button"
              className="workspace-alerts-collapse"
              onClick={() => setOpen(false)}
              aria-label="Collapse alerts"
              title="Collapse"
            >
              ›
            </button>
          </header>
          <div className="workspace-alerts-body" role="status" aria-live="polite">
            {alerts.map((alert) => (
              <CollapsibleAlert
                key={alert.id}
                alert={alert}
                expanded={expandedIds.has(alert.id)}
                onToggle={() => toggleExpanded(alert.id)}
              />
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

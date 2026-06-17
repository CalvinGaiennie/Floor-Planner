import { useFloorPlan } from '../context/FloorPlanContext'

function formatChangeCount(count: number): string {
  return `${count} change${count === 1 ? '' : 's'}`
}

export function CloudSaveStatus() {
  const { cloudSyncActive, unsavedCloudChanges, cloudSaveInFlight, forceCloudSave } = useFloorPlan()

  if (!cloudSyncActive) return null

  let title: string
  let message: string
  let statusClass: 'saved' | 'saving' | 'pending'

  if (unsavedCloudChanges > 0 && cloudSaveInFlight) {
    title = 'Saving to cloud'
    message = `Saving ${formatChangeCount(unsavedCloudChanges)}…`
    statusClass = 'saving'
  } else if (unsavedCloudChanges > 0) {
    title = 'Not saved to cloud'
    message = `${formatChangeCount(unsavedCloudChanges)} since last successful save`
    statusClass = 'pending'
  } else {
    title = 'Cloud save'
    message = 'All changes saved'
    statusClass = 'saved'
  }

  return (
    <div className={`workspace-save-status workspace-save-status-${statusClass}`} aria-live="polite">
      <div className="workspace-save-status-header">
        <span className="workspace-save-status-title">{title}</span>
        {unsavedCloudChanges > 0 && (
          <span className="workspace-save-status-count" aria-label={`${unsavedCloudChanges} unsaved changes`}>
            {unsavedCloudChanges}
          </span>
        )}
      </div>
      <p className="workspace-save-status-message">{message}</p>
      <div className="workspace-save-status-actions">
        <button
          type="button"
          className="workspace-save-status-force"
          disabled={cloudSaveInFlight}
          onClick={() => forceCloudSave()}
        >
          {cloudSaveInFlight ? 'Saving…' : 'Force save now'}
        </button>
      </div>
    </div>
  )
}

import { useEffect } from 'react'

export interface ToolbarAlert {
  id: string
  title: string
  message: string
  details?: string
}

export function ToolbarMessageModal({
  alert,
  onClose,
}: {
  alert: ToolbarAlert | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!alert) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [alert, onClose])

  if (!alert) return null

  return (
    <div className="toolbar-message-modal-overlay" onClick={onClose}>
      <div
        className="toolbar-message-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="toolbar-message-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="toolbar-message-modal-title">{alert.title}</h2>
        <p className="toolbar-message-modal-message">{alert.message}</p>
        {alert.details && <p className="toolbar-message-modal-details">{alert.details}</p>}
        <div className="toolbar-message-modal-actions">
          <button type="button" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function ToolbarAlertChip({
  alert,
  onOpen,
}: {
  alert: ToolbarAlert
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="toolbar-hint toolbar-hint-btn toolbar-error"
      onClick={onOpen}
      aria-label={`${alert.title}. Click for details.`}
    >
      {alert.message}
    </button>
  )
}

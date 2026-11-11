import { memo } from 'react'
import { Download, X } from 'lucide-react'
import type { AppUpdateInfo } from '../../../../shared/nextdj'

interface UpdateNoticeProps {
  update: AppUpdateInfo
  openingDownload: boolean
  error: string | null
  onDismiss: () => void
  onDownload: () => void
}

export const UpdateNotice = memo(function UpdateNotice({
  update,
  openingDownload,
  error,
  onDismiss,
  onDownload
}: UpdateNoticeProps): JSX.Element {
  return (
    <section aria-label="Application update" className="update-notice" role="status">
      <span aria-hidden="true" className="update-notice-led" />
      <div className="update-notice-copy">
        <strong>NextDJ {update.latestVersion} is available</strong>
        <span>Installed: {update.currentVersion}</span>
        {error ? <span className="update-notice-error">{error}</span> : null}
      </div>
      <button className="update-download-button" disabled={openingDownload} type="button" onClick={onDownload}>
        <Download aria-hidden="true" size={14} strokeWidth={2.4} />
        {openingDownload ? 'Opening…' : 'Download update'}
      </button>
      <button
        aria-label="Dismiss update notice"
        className="update-dismiss-button"
        title="Dismiss"
        type="button"
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={14} strokeWidth={2.4} />
      </button>
    </section>
  )
})

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { clearOfflineData, downloadCsv, getOfflineData, rowsToCsv } from '../lib/offlineStorage'

/** Minimal export-only page – does not alter other screens. */
export default function DataExport() {
  const [status, setStatus] = useState('')

  async function onExportCsv() {
    const rows = await getOfflineData()
    const flat = rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind,
      method: r.method ?? '',
      url: r.url ?? '',
      payload:
        r.data != null ? (typeof r.data === 'object' ? JSON.stringify(r.data) : String(r.data)) : '',
    }))
    const csv = rowsToCsv(flat)
    downloadCsv(`smb-offline-export-${Date.now()}.csv`, csv || 'id,ts,kind,method,url,payload\n')
    setStatus('CSV download started.')
  }

  async function onClear() {
    await clearOfflineData()
    setStatus('Offline store cleared.')
  }

  return (
    <div className="mx-auto max-w-lg p-4 pb-24 pt-8">
      <h1 className="text-lg font-semibold text-violet-950">Export data</h1>
      <p className="mt-2 text-sm text-violet-800/80">
        Download queued API payloads and offline snapshots as CSV. Clear only if you intend to discard queued sync
        items.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onExportCsv()}
          className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-950"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => void onClear()}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
        >
          Clear offline store
        </button>
      </div>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-[#6C3BFF]">
        Back
      </Link>
      {status ? <p className="mt-3 text-xs text-violet-700">{status}</p> : null}
    </div>
  )
}

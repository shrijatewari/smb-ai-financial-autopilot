import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDocumentProfile, getApiErrorMessage, uploadDocuments } from '../services/api'
import { MOCK_ANOMALY_FLAGS } from '../lib/platformMocks'

function formatPct(p) {
  if (p == null || Number.isNaN(p)) return '–'
  return `${(100 * p).toFixed(1)}%`
}

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export default function Documents() {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const inputRef = useRef(null)

  const loadSaved = useCallback(async () => {
    try {
      const data = await fetchDocumentProfile()
      setSavedProfile(data?.profile ?? null)
    } catch {
      setSavedProfile(null)
    }
  }, [])

  useEffect(() => {
    loadSaved()
  }, [loadSaved])

  const onFiles = (list) => {
    const arr = Array.from(list || []).filter(Boolean)
    setFiles(arr)
    setError(null)
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onFiles(e.dataTransfer?.files)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  async function analyze() {
    if (!files.length) {
      setError('Add at least one PDF or image.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await uploadDocuments(files)
      setResult(data)
      setSavedProfile(data?.profile ?? null)
    } catch (e) {
      setError(getApiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const profile = result?.profile ?? savedProfile

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 pb-24">
      <header className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-violet-950">
            Document intelligence
          </h1>
          <p className="mt-1 text-sm text-violet-950/60">
            Upload bank / account statements, GST invoices, bills, or scans (PDF or images) – we infer
            business context for the control plane. Scanned PDFs are rasterized and OCR’d when you set
            Vision credentials or Tesseract.
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-[#6C3BFF] underline-offset-2 hover:underline">
          ← Twin home
        </Link>
      </header>

      <section className="mb-8 rounded-2xl border border-violet-200/50 bg-white/70 p-6 shadow-lg shadow-violet-500/5 backdrop-blur-md">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-400">
          Upload
        </h2>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-violet-300/80 bg-violet-50/40 px-6 py-12 text-center transition hover:border-[#6C3BFF]/50 hover:bg-violet-50/70"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <p className="text-sm font-medium text-violet-950">Drag & drop files here</p>
          <p className="mt-1 text-xs text-violet-950/55">or click to choose · PDF, PNG, JPG</p>
        </div>

        {files.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-violet-900/90">
            {files.map((f) => (
              <li key={f.name + f.size} className="truncate">
                {f.name}{' '}
                <span className="text-violet-400">({Math.round(f.size / 1024)} KB)</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={analyze}
            disabled={busy || !files.length}
            className="rounded-full bg-gradient-to-r from-[#6C3BFF] to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6C3BFF]/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze business'}
          </button>
          <button
            type="button"
            onClick={() => {
              setFiles([])
              setResult(null)
              setError(null)
            }}
            className="rounded-full border border-violet-200 px-4 py-2 text-sm text-violet-800 hover:bg-violet-50"
          >
            Clear
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {result?.status === 'success' && (
          <div className="mt-4 space-y-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-4 text-left">
            <p className="text-sm font-semibold text-emerald-900">
              Processed {result.documents_processed} file(s) – profile merged for the next engine tick.
            </p>
            {result?.profile && (
              <div className="flex flex-wrap gap-2">
                {result.profile.business_type && (
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold capitalize text-emerald-900 shadow-sm">
                    {String(result.profile.business_type).replace(/_/g, ' ')}
                  </span>
                )}
                {result.profile.transaction_frequency && (
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-emerald-900 shadow-sm">
                    {result.profile.transaction_frequency}
                  </span>
                )}
                {result.profile.vendor_count != null && (
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-emerald-900 shadow-sm">
                    {result.profile.vendor_count} vendors (est.)
                  </span>
                )}
              </div>
            )}
            <div className="grid gap-2 text-xs text-emerald-950/90 sm:grid-cols-3">
              <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                <p className="font-semibold text-emerald-900">Amounts parsed</p>
                <p className="tabular-nums text-lg font-bold">
                  {result.profile?.amount_samples != null ? result.profile.amount_samples : '–'}
                </p>
              </div>
              <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                <p className="font-semibold text-emerald-900">Median ticket</p>
                <p className="tabular-nums text-lg font-bold">{formatInr(result.profile?.avg_ticket_size)}</p>
              </div>
              <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                <p className="font-semibold text-emerald-900">Anomaly hints</p>
                <p className="tabular-nums text-lg font-bold">{MOCK_ANOMALY_FLAGS.length} (demo)</p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-900/80">
              Live anomaly detection uses your ledger history; demo count shows the kind of signal you&apos;ll see at
              scale.
            </p>
          </div>
        )}

        {Array.isArray(result?.results) && result.results.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              OCR preview (first 500 chars per file)
            </h3>
            {result.results.map((row) => (
              <div
                key={row.filename}
                className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs"
              >
                <p className="font-medium text-violet-950">{row.filename}</p>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-violet-800/80">
                  {row.extracted_text || '–'}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-violet-200/50 bg-white/70 p-6 shadow-lg shadow-violet-500/5 backdrop-blur-md">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-violet-400">
          Inferred profile
        </h2>
        {!profile ? (
          <p className="text-sm text-violet-950/55">No profile yet. Upload invoices to see signals.</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Business type</dt>
              <dd className="mt-0.5 text-sm font-medium capitalize text-violet-950">
                {String(profile.business_type || '–').replace(/_/g, ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Typical transaction (median)</dt>
              <dd className="mt-0.5 text-sm text-violet-950">{formatInr(profile.avg_ticket_size)}</dd>
              <dd className="mt-1 text-[11px] leading-snug text-violet-950/55">
                Middle value of ₹ amounts parsed from your documents (not a daily average). Small values
                usually mean noisy OCR – upload clearer totals or line items.
                {profile.amount_samples != null ? ` · ${profile.amount_samples} amount(s) detected` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Cash ratio (estimate)</dt>
              <dd className="mt-0.5 text-sm text-violet-950">
                {formatPct(profile.cash_ratio_estimate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Confidence</dt>
              <dd className="mt-0.5 text-sm text-violet-950">
                {profile.confidence != null ? `${(profile.confidence * 100).toFixed(1)}%` : '–'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Vendors (estimate)</dt>
              <dd className="mt-0.5 text-sm text-violet-950">{profile.vendor_count ?? '–'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-violet-400">Transaction frequency</dt>
              <dd className="mt-0.5 text-sm capitalize text-violet-950">
                {profile.transaction_frequency ?? '–'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase text-violet-400">Seasonality</dt>
              <dd className="mt-0.5 text-sm text-violet-900/90">
                {profile.seasonality_hint ?? '–'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase text-violet-400">Supplier structure</dt>
              <dd className="mt-0.5 text-sm capitalize text-violet-900/90">
                {profile.supplier_structure ?? '–'}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  )
}

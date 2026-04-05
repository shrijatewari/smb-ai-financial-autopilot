import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import {
  downloadLedgerCsv,
  fetchLedgerSummary,
  fetchLedgerTransactions,
  fetchPaytmTransactions,
  getApiErrorMessage,
} from '../services/api'
import { mockTransactionsFromState } from '../lib/mockData'
import { cn } from '../lib/utils'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

/** Matches backend `LedgerTransaction.source` style labels for the table. */
function formatSource(src) {
  if (!src) return '—'
  const map = {
    razorpay_webhook: 'Razorpay',
    account_aggregator: 'Bank (AA)',
    sms: 'SMS / UPI',
    paytm: 'Paytm',
    api: 'API',
    ocr: 'OCR',
    unknown: '—',
    ingestion: 'Ingestion',
  }
  return map[src] || String(src).replace(/_/g, ' ')
}

function rowMatchesDescription(row, q) {
  if (!q || !String(q).trim()) return true
  return (row.description || '').toLowerCase().includes(String(q).trim().toLowerCase())
}

/** Client-side filter for Paytm/mock rows; must match stored `source` (improvement 12). */
function rowMatchesSource(row, source) {
  if (!source || !String(source).trim()) return true
  return (row.source || '') === source
}

/** Improvement 14 — credit/debit filter (server + client Paytm/mock). */
function rowMatchesTxnType(row, txnType) {
  if (!txnType || !String(txnType).trim()) return true
  return (row.type || '') === txnType
}

/** Improvement 16 — category filter (server + client Paytm/mock). */
function rowMatchesCategory(row, category) {
  if (!category || !String(category).trim()) return true
  return (row.category || '').toLowerCase() === String(category).trim().toLowerCase()
}

function formatCategory(cat) {
  if (!cat) return '—'
  return String(cat).replace(/_/g, ' ')
}

/** Improvement 13 — server-side pagination (GET /transactions/ledger?offset=&limit=). */
const LEDGER_PAGE_SIZE = 200

const LEDGER_TXN_TYPE_OPTIONS = [
  { value: '', label: 'Credits & debits' },
  { value: 'credit', label: 'Credits only' },
  { value: 'debit', label: 'Debits only' },
]

/** Improvement 15 — persisted ledger sort (GET /transactions/ledger?sort=). */
const LEDGER_SORT_DEFAULT = 'date_desc'
const LEDGER_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Largest amount' },
  { value: 'amount_asc', label: 'Smallest amount' },
]

const LEDGER_SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'razorpay_webhook', label: 'Razorpay' },
  { value: 'account_aggregator', label: 'Bank (AA)' },
  { value: 'sms', label: 'SMS / UPI' },
  { value: 'paytm', label: 'Paytm' },
  { value: 'api', label: 'API' },
  { value: 'ocr', label: 'OCR' },
  { value: 'ingestion', label: 'Ingestion' },
  { value: 'unknown', label: 'Unknown' },
]

const LEDGER_CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'collection', label: 'Collection' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'sale', label: 'Sale' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'bank_aa', label: 'Bank (AA)' },
  { value: 'expense', label: 'Expense' },
  { value: 'personal', label: 'Personal' },
  { value: 'unknown', label: 'Unknown' },
]

function mapLedgerRow(t) {
  const typ = (t.type || '').toLowerCase()
  const amt = Number(t.amount)
  return {
    id: `ledger-${t.id}`,
    date: t.date || '—',
    description: t.description || '—',
    amount: amt,
    type: typ === 'credit' ? 'credit' : 'debit',
    confidence: t.confidence != null && !Number.isNaN(Number(t.confidence)) ? Number(t.confidence) : 0.9,
    source: t.source || 'unknown',
    category: t.category || '',
  }
}

export default function Transactions() {
  const { snapshot: snap } = useSystemSnapshot()
  const [searchParams, setSearchParams] = useSearchParams()
  const [paytm, setPaytm] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [ledgerSummary, setLedgerSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportErr, setExportErr] = useState(null)
  /** YYYY-MM-DD; empty = no bound (improvement 9 — ledger date range). */
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('date_from') || '')
  const [dateTo, setDateTo] = useState(() => searchParams.get('date_to') || '')
  const [appliedFrom, setAppliedFrom] = useState(() => searchParams.get('date_from') || '')
  const [appliedTo, setAppliedTo] = useState(() => searchParams.get('date_to') || '')
  /** Improvement 11 — description substring (server + client Paytm/mock). */
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '')
  const [appliedQ, setAppliedQ] = useState(() => searchParams.get('q') || '')
  /** Improvement 12 — exact source + bookmarkable URL (?source=…). */
  const [sourceInput, setSourceInput] = useState(() => searchParams.get('source') || '')
  const [appliedSource, setAppliedSource] = useState(() => searchParams.get('source') || '')
  const [txnTypeInput, setTxnTypeInput] = useState(() => searchParams.get('txn_type') || '')
  const [appliedTxnType, setAppliedTxnType] = useState(() => searchParams.get('txn_type') || '')
  /** Improvement 15 — sort= on ledger + export (summary ignores order). */
  const [sortInput, setSortInput] = useState(() => searchParams.get('sort') || LEDGER_SORT_DEFAULT)
  const [appliedSort, setAppliedSort] = useState(() => searchParams.get('sort') || LEDGER_SORT_DEFAULT)
  /** Improvement 16 — business category (ledger column). */
  const [categoryInput, setCategoryInput] = useState(() => searchParams.get('category') || '')
  const [appliedCategory, setAppliedCategory] = useState(() => searchParams.get('category') || '')
  /** Bumps when Apply/Clear is clicked so we refetch even if URL is unchanged. */
  const [ledgerRefresh, setLedgerRefresh] = useState(0)
  /** Offset into persisted ledger (not in share URL — resets when filters change). */
  const [ledgerOffset, setLedgerOffset] = useState(0)

  /** Keep inputs + applied filters in sync when the query string changes (share link, back/forward). */
  useEffect(() => {
    const df = searchParams.get('date_from') || ''
    const dt = searchParams.get('date_to') || ''
    const q = searchParams.get('q') || ''
    const src = searchParams.get('source') || ''
    const tt = searchParams.get('txn_type') || ''
    const so = searchParams.get('sort') || LEDGER_SORT_DEFAULT
    const cat = searchParams.get('category') || ''
    setDateFrom(df)
    setDateTo(dt)
    setSearchInput(q)
    setSourceInput(src)
    setTxnTypeInput(tt)
    setAppliedFrom(df)
    setAppliedTo(dt)
    setAppliedQ(q)
    setAppliedSource(src)
    setAppliedTxnType(tt)
    setSortInput(so)
    setAppliedSort(so)
    setCategoryInput(cat)
    setAppliedCategory(cat)
    setLedgerOffset(0)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ledgerParams = { limit: LEDGER_PAGE_SIZE, offset: ledgerOffset }
        const summaryParams = {}
        if (appliedFrom.trim()) {
          ledgerParams.date_from = appliedFrom.trim()
          summaryParams.date_from = appliedFrom.trim()
        }
        if (appliedTo.trim()) {
          ledgerParams.date_to = appliedTo.trim()
          summaryParams.date_to = appliedTo.trim()
        }
        if (appliedQ.trim()) {
          ledgerParams.q = appliedQ.trim()
          summaryParams.q = appliedQ.trim()
        }
        if (appliedSource.trim()) {
          ledgerParams.source = appliedSource.trim()
          summaryParams.source = appliedSource.trim()
        }
        if (appliedTxnType.trim()) {
          ledgerParams.txn_type = appliedTxnType.trim()
          summaryParams.txn_type = appliedTxnType.trim()
        }
        if (appliedSort && appliedSort !== LEDGER_SORT_DEFAULT) {
          ledgerParams.sort = appliedSort
        }
        if (appliedCategory.trim()) {
          ledgerParams.category = appliedCategory.trim()
          summaryParams.category = appliedCategory.trim()
        }
        const [p, l, s] = await Promise.all([
          fetchPaytmTransactions().catch(() => null),
          fetchLedgerTransactions(ledgerParams).catch(() => null),
          fetchLedgerSummary(summaryParams).catch(() => null),
        ])
        if (!cancelled) {
          setPaytm(p)
          setLedger(l)
          setLedgerSummary(s)
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    appliedFrom,
    appliedTo,
    appliedQ,
    appliedSource,
    appliedTxnType,
    appliedCategory,
    appliedSort,
    ledgerOffset,
    ledgerRefresh,
  ])

  const { rows: mockRows } = mockTransactionsFromState(snap || {})
  const ledgerRows = (ledger?.transactions || []).map(mapLedgerRow)
  const ledgerOk = ledger?.status === 'ok'
  /** Avoid mock fallback when filters return zero rows but the ledger API was queried. */
  const hasPersistedLedger =
    ledgerOk &&
    ((ledger.total ?? 0) > 0 ||
      ledgerRows.length > 0 ||
      !!(
        appliedQ.trim() ||
        appliedFrom.trim() ||
        appliedTo.trim() ||
        appliedSource.trim() ||
        appliedTxnType.trim() ||
        appliedCategory.trim()
      ))
  const paytmRows = (paytm?.transactions || []).map((t, i) => ({
    id: t.id || `p-${i}`,
    date: new Date().toISOString().slice(0, 10),
    description: t.description || 'Paytm',
    amount: t.amount,
    type: t.amount >= 0 ? 'credit' : 'debit',
    confidence: 0.91,
    source: t.source || 'paytm',
    category: t.category ?? '',
  }))
  const paytmRowsFiltered = paytmRows
    .filter((r) => rowMatchesDescription(r, appliedQ))
    .filter((r) => rowMatchesSource(r, appliedSource))
    .filter((r) => rowMatchesTxnType(r, appliedTxnType))
    .filter((r) => rowMatchesCategory(r, appliedCategory))
  const mockRowsFiltered = mockRows
    .filter((r) => rowMatchesDescription(r, appliedQ))
    .filter((r) => rowMatchesSource(r, appliedSource))
    .filter((r) => rowMatchesTxnType(r, appliedTxnType))
    .filter((r) => rowMatchesCategory(r, appliedCategory))

  const coreRows = hasPersistedLedger
    ? paytmRowsFiltered.length
      ? [...paytmRowsFiltered, ...ledgerRows]
      : ledgerRows
    : paytmRowsFiltered.length
      ? [...paytmRowsFiltered, ...mockRowsFiltered.slice(0, 2)]
      : mockRowsFiltered

  const filtersActive = Boolean(
    appliedQ.trim() ||
      appliedFrom.trim() ||
      appliedTo.trim() ||
      appliedSource.trim() ||
      appliedTxnType.trim() ||
      appliedCategory.trim()
  )

  /** If nothing to show and user did not narrow with filters, show demo rows so the page is never empty. */
  const rows =
    coreRows.length === 0 && !filtersActive ? mockRowsFiltered : coreRows

  const noSavedTransactions =
    ledgerSummary?.status === 'ok' && (ledgerSummary?.count ?? 0) === 0
  /** Empty DB / empty page → we fill with client demo rows; or persisted query returned nothing without filters. */
  const showDemoExplainer =
    noSavedTransactions || (coreRows.length === 0 && !filtersActive && rows.length > 0)
  const spark = rows.slice(0, 8).map((r, i) => ({ i, v: Math.abs(r.amount) }))

  async function onExportLedger() {
    setExportBusy(true)
    setExportErr(null)
    try {
      const p = {}
      if (appliedFrom.trim()) p.date_from = appliedFrom.trim()
      if (appliedTo.trim()) p.date_to = appliedTo.trim()
      if (appliedQ.trim()) p.q = appliedQ.trim()
      if (appliedSource.trim()) p.source = appliedSource.trim()
      if (appliedTxnType.trim()) p.txn_type = appliedTxnType.trim()
      if (appliedSort && appliedSort !== LEDGER_SORT_DEFAULT) p.sort = appliedSort
      if (appliedCategory.trim()) p.category = appliedCategory.trim()
      await downloadLedgerCsv(p)
    } catch (e) {
      setExportErr(getApiErrorMessage(e))
    } finally {
      setExportBusy(false)
    }
  }

  function applyLedgerFilters() {
    setLoading(true)
    setLedgerOffset(0)
    const df = dateFrom.trim()
    const dt = dateTo.trim()
    const q = searchInput.trim()
    const src = sourceInput.trim()
    const tt = txnTypeInput.trim()
    const so = sortInput.trim() || LEDGER_SORT_DEFAULT
    const cat = categoryInput.trim()
    setAppliedFrom(df)
    setAppliedTo(dt)
    setAppliedQ(q)
    setAppliedSource(src)
    setAppliedTxnType(tt)
    setAppliedSort(so)
    setAppliedCategory(cat)
    const next = new URLSearchParams()
    if (df) next.set('date_from', df)
    if (dt) next.set('date_to', dt)
    if (q) next.set('q', q)
    if (src) next.set('source', src)
    if (tt) next.set('txn_type', tt)
    if (so !== LEDGER_SORT_DEFAULT) next.set('sort', so)
    if (cat) next.set('category', cat)
    setSearchParams(next, { replace: true })
    setLedgerRefresh((n) => n + 1)
  }

  function clearLedgerFilters() {
    setLoading(true)
    setLedgerOffset(0)
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSourceInput('')
    setTxnTypeInput('')
    setSortInput(LEDGER_SORT_DEFAULT)
    setCategoryInput('')
    setAppliedFrom('')
    setAppliedTo('')
    setAppliedQ('')
    setAppliedSource('')
    setAppliedTxnType('')
    setAppliedSort(LEDGER_SORT_DEFAULT)
    setAppliedCategory('')
    setSearchParams(new URLSearchParams(), { replace: true })
    setLedgerRefresh((n) => n + 1)
  }

  const ledgerTotal = ledger?.total
  const persistedRangeStart =
    ledgerTotal && ledgerTotal > 0 ? ledgerOffset + 1 : ledgerRows.length > 0 ? ledgerOffset + 1 : 0
  const persistedRangeEnd = ledgerOffset + ledgerRows.length
  const canLedgerPrev = hasPersistedLedger && ledgerOffset > 0
  const canLedgerNext =
    hasPersistedLedger &&
    ledgerTotal != null &&
    ledgerOffset + (ledger?.transactions?.length ?? 0) < ledgerTotal

  function goLedgerPrev() {
    if (!canLedgerPrev) return
    setLoading(true)
    setLedgerOffset((o) => Math.max(0, o - LEDGER_PAGE_SIZE))
  }

  function goLedgerNext() {
    if (!canLedgerNext) return
    setLoading(true)
    setLedgerOffset((o) => o + LEDGER_PAGE_SIZE)
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Transactions"
        subtitle="Your ledger from SMS, bank, Razorpay, and uploads — with AI confidence on each line. Use filters to narrow by date, source, or description; export matches what you see (with the same filters)."
      >
        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:items-end">
          <div className="flex w-full min-w-0 flex-wrap items-end justify-end gap-x-2 gap-y-3">
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-from">
                From
              </label>
              <input
                id="ledger-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-0.5 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-to">
                To
              </label>
              <input
                id="ledger-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-0.5 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-source">
                Source
              </label>
              <select
                id="ledger-source"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                className="mt-0.5 min-w-[9rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              >
                {LEDGER_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-category">
                Category
              </label>
              <select
                id="ledger-category"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
                title="GET /transactions/ledger?category="
              >
                {LEDGER_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-txn-type">
                Type
              </label>
              <select
                id="ledger-txn-type"
                value={txnTypeInput}
                onChange={(e) => setTxnTypeInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
              >
                {LEDGER_TXN_TYPE_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-sort">
                Sort (persisted)
              </label>
              <select
                id="ledger-sort"
                value={sortInput}
                onChange={(e) => setSortInput(e.target.value)}
                className="mt-0.5 min-w-[9.5rem] rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950"
                title="GET /transactions/ledger?sort="
              >
                {LEDGER_SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 basis-full sm:basis-auto sm:min-w-[180px] sm:max-w-xs sm:flex-1">
              <label className="block text-[10px] font-medium text-violet-700/80" htmlFor="ledger-q">
                Search description
              </label>
              <input
                id="ledger-q"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="UPI, merchant…"
                maxLength={200}
                className="mt-0.5 w-full min-w-0 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-950 placeholder:text-violet-400"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyLedgerFilters()}>
                Apply
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => clearLedgerFilters()}>
                Clear
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading || exportBusy}
            onClick={() => void onExportLedger()}
            title="GET /transactions/ledger/export"
          >
            {exportBusy ? 'Preparing…' : 'Export ledger CSV'}
          </Button>
          {exportErr && <p className="max-w-xs text-right text-xs text-red-600">{exportErr}</p>}
        </div>
      </PageHeader>
      <details className="mb-6 rounded-xl border border-violet-200/60 bg-violet-50/40 px-4 py-3 text-sm text-violet-800/90">
        <summary className="cursor-pointer font-medium text-violet-950">Technical details (API & query params)</summary>
        <p className="mt-2 text-xs leading-relaxed text-violet-950/75">
          Filters sync to the URL for sharing. Persisted data uses{' '}
          <code className="rounded bg-white/80 px-1">GET /transactions/ledger</code> with pagination (200 rows per page),
          <code className="rounded bg-white/80 px-1">sort=</code>, <code className="rounded bg-white/80 px-1">txn_type=</code>
          , and <code className="rounded bg-white/80 px-1">category=</code>. Totals use{' '}
          <code className="rounded bg-white/80 px-1">GET /transactions/ledger/summary</code> over the full filtered set.
          Paytm rows are merged in the browser when connected. CSV export applies the same filters as the table.
        </p>
      </details>
      {!loading && hasPersistedLedger && (
        <p className="mb-4 text-sm text-emerald-800/90">
          Showing {ledgerRows.length} persisted row{ledgerRows.length === 1 ? '' : 's'}
          {ledger?.total != null && (
            <>
              {' '}
              ({ledger.total}{' '}
              {appliedFrom || appliedTo || appliedQ || appliedSource || appliedTxnType || appliedCategory
                ? 'matching filters'
                : 'total in database'}
              {ledger.total > ledgerRows.length
                ? ` — page ${persistedRangeStart}–${persistedRangeEnd} (offset ${ledgerOffset})`
                : ''})
            </>
          )}
          {(appliedFrom || appliedTo) && (
            <span className="text-violet-800/90">
              {' '}
              · {appliedFrom || '…'} → {appliedTo || '…'} (UTC day bounds)
            </span>
          )}
          {appliedQ && <span className="text-violet-800/90">{` · search '${appliedQ}'`}</span>}
          {appliedSource && (
            <span className="text-violet-800/90">{` · source ${formatSource(appliedSource)}`}</span>
          )}
          {appliedCategory && (
            <span className="text-violet-800/90">{` · category ${formatCategory(appliedCategory)}`}</span>
          )}
          {appliedTxnType && (
            <span className="text-violet-800/90">{` · ${appliedTxnType === 'credit' ? 'credits' : 'debits'} only`}</span>
          )}
          {appliedSort !== LEDGER_SORT_DEFAULT && (
            <span className="text-violet-800/90">
              {' '}
              · sort:{' '}
              {LEDGER_SORT_OPTIONS.find((o) => o.value === appliedSort)?.label ?? appliedSort}
              {' '}
              (persisted rows)
            </span>
          )}
          {paytmRowsFiltered.length
            ? appliedQ.trim()
              ? ' · Paytm mock rows above them (search also filters Paytm in the browser)'
              : ' · Paytm mock rows above them'
            : ''}
          .
        </p>
      )}
      {showDemoExplainer && (
        <div className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm">
          <p className="font-medium text-amber-950">Example transactions (demo)</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/85">
            No rows are stored in your database yet (or the API could not load them). The table below shows{' '}
            <strong>sample</strong> UPI, Razorpay, and supplier lines so you can explore filters and layout. Connect
            Paytm, upload a CSV, or add SMS under Today to build your real ledger.
          </p>
        </div>
      )}
      {!loading && ledgerSummary?.status === 'ok' && (
        <Card className="mb-6 border border-teal-200/60 bg-gradient-to-br from-white to-teal-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ledger totals (saved in your database)</CardTitle>
            <p className="text-xs font-normal text-violet-950/65">
              Matches the date range and filters above. Counts and sums are for the full filtered set, not just this page.
              Demo / sample rows in the table are not included here.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Rows</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-violet-950">{ledgerSummary.count}</dd>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Inflows (credit)</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
                  {formatInr(ledgerSummary.total_credit)}
                </dd>
              </div>
              <div className="rounded-xl border border-rose-100 bg-white/80 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Outflows (debit)</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-900">
                  {formatInr(ledgerSummary.total_debit)}
                </dd>
              </div>
              <div className="rounded-xl border border-violet-200 bg-white/90 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">Net (in − out)</dt>
                <dd
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    ledgerSummary.net >= 0 ? 'text-emerald-800' : 'text-rose-800'
                  )}
                >
                  {formatInr(ledgerSummary.net)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Activity pulse</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6C3BFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(108,59,255,0.2)' }}
                    formatter={(v) => [formatInr(v), 'Amount']}
                  />
                  <Area type="monotone" dataKey="v" stroke="#6C3BFF" fill="url(#txFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insight</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-violet-950/70">
            {snap?.risk != null && (
              <p>
                Model estimates <span className="font-semibold text-violet-900">{(100 * snap.risk).toFixed(1)}%</span>{' '}
                cash stress in horizon — reconcile uncertain tags to improve confidence.
              </p>
            )}
            {!snap && !loading && (
              <p>
                Connect Paytm (dashboard), link your bank under Profile, or collect via Razorpay — webhook payments
                post to the ledger automatically when configured.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

        <Card className="mt-8">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <CardTitle>Recent lines</CardTitle>
            {showDemoExplainer && (
              <p className="mt-1 text-xs font-medium text-amber-800/90">Showing demo data — not your live bank feed</p>
            )}
          </div>
          {hasPersistedLedger && ledgerTotal != null && ledgerTotal > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tabular-nums text-violet-600">
                Persisted rows {persistedRangeStart}–{persistedRangeEnd} of {ledgerTotal} ({LEDGER_PAGE_SIZE} / page)
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canLedgerPrev || loading}
                  onClick={() => goLedgerPrev()}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canLedgerNext || loading}
                  onClick={() => goLedgerNext()}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-100 bg-violet-50/40 text-xs uppercase tracking-wide text-violet-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-violet-50">
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-violet-600">
                        No transactions match these filters. Clear filters or widen the date range.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-violet-50/80 hover:bg-violet-50/30"
                    >
                      <td className="px-4 py-3 tabular-nums text-violet-950/80">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {r.date}
                          {r.demo ? (
                            <Badge variant="warning" className="text-[10px] font-semibold uppercase">
                              Demo
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-violet-950">{r.description}</td>
                      <td className="px-4 py-3 text-xs text-violet-700/90">{formatSource(r.source)}</td>
                      <td className="px-4 py-3 text-xs capitalize text-violet-700/85">{formatCategory(r.category)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            r.type === 'credit' ? 'success' : r.type === 'uncertain' ? 'warning' : 'danger'
                          }
                          className="capitalize"
                        >
                          {r.type === 'credit' ? 'sales' : r.type === 'uncertain' ? 'uncertain' : 'expense'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-violet-950">
                        {formatInr(r.amount)}
                      </td>
                      <td className="px-4 py-3 w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={(r.confidence || 0) * 100} className="flex-1" />
                          <span className="text-xs text-violet-600">{((r.confidence || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

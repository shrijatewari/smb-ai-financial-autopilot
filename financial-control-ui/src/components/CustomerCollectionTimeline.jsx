import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { formatInr } from '../lib/collections'
import { lateRiskPct } from './CollectionQueueList'
import { cn } from '../lib/utils'
import { getApiErrorMessage, getBillDetail } from '../services/api'

/**
 * Per-customer collections timeline – past touch, today suggestion, future ladder (demo + product).
 * @param {object} [customerInfo] – from GET /collections/customers (bill_id, bill, phone).
 */
export function CustomerCollectionTimeline({
  row,
  customerInfo,
  onClose,
  onWhatsApp,
  onPaymentLink,
  busy,
}) {
  const [billOpen, setBillOpen] = useState(false)
  const [billDetail, setBillDetail] = useState(null)
  const [billErr, setBillErr] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!row) return null
  const pct = lateRiskPct(row)
  const high = pct >= 55
  const billId = customerInfo?.bill_id || customerInfo?.bill?.id

  async function loadBill() {
    if (!billId) return
    setBillErr(null)
    try {
      const d = await getBillDetail(billId)
      setBillDetail(d)
    } catch (e) {
      setBillErr(getApiErrorMessage(e))
    }
  }

  function toggleBill() {
    const next = !billOpen
    setBillOpen(next)
    if (next && !billDetail && billId) void loadBill()
  }

  const lineRows = Array.isArray(billDetail?.parsed_items?.lines) ? billDetail.parsed_items.lines : []

  return (
    <div
      className="fixed inset-0 z-[115] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-violet-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-5 py-4">
          <div>
            <h2 id="timeline-title" className="text-lg font-bold text-violet-950">
              {row.name}
            </h2>
            <p className="text-sm text-violet-700">
              {formatInr(row.amount)} · {row.days_late != null ? `${row.days_late} din se due` : 'due'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {high && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">High risk</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-violet-600 hover:bg-violet-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {billId && (
          <div className="border-b border-violet-100 px-5 py-3">
            <button
              type="button"
              onClick={() => toggleBill()}
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#6C3BFF]"
            >
              Bill dekho
              {billOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {billOpen && (
              <div className="mt-2 text-xs text-violet-800">
                {billErr && <p className="text-red-600">{billErr}</p>}
                {!billErr && billDetail && (
                  <ul className="space-y-1 rounded-lg bg-violet-50/80 p-3">
                    <li className="font-medium">Bill #{billDetail.bill_number}</li>
                    <li>Total: {formatInr(billDetail.total_amount)}</li>
                    <li>Source: {billDetail.source}</li>
                    {lineRows
                      .filter((x) => x && typeof x === 'object')
                      .map((ln, i) => (
                        <li key={i}>
                          • {ln.name} × {ln.qty} {ln.matched === false ? '(unknown SKU)' : ''}
                        </li>
                      ))}
                  </ul>
                )}
                {billOpen && !billDetail && !billErr && <p className="text-violet-600">Loading…</p>}
              </div>
            )}
          </div>
        )}

        <div className="space-y-0 px-5 py-4">
          <TimelineItem
            tone="done"
            title="WhatsApp reminder bheja"
            meta="3 din pehle"
            body='"Aapka payment pending hai…"'
          />
          <TimelineItem
            tone="today"
            title="Aaj: Follow-up + bill proof"
            meta="Suggested action · Tap below"
            highlight
          />
          <div className="flex flex-col gap-2 pb-2 pl-8">
            {billId && (
              <button
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
                className="rounded-xl border border-violet-200 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50"
              >
                {previewOpen ? 'Hide' : 'Show'} WhatsApp message preview
              </button>
            )}
            {previewOpen && billId && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 text-xs leading-relaxed text-violet-900">
                <p className="font-semibold text-violet-950">Preview (with bill link)</p>
                <p className="mt-2 whitespace-pre-wrap">
                  Namaste {row.name} ji,{'\n\n'}
                  [shop] se aapka {formatInr(row.amount)} rupaye baaki hai.{'\n\n'}
                  Aapki khareedari ki details:{'\n'}
                  {billDetail?.parsed_items?.lines
                    ?.filter((l) => l?.name)
                    .map((l) => `• ${l.name} x ${l.qty} – ₹…`)
                    .join('\n') || '• (item lines from linked bill)'}
                  {'\n\n'}
                  Kul rakam / Tarikh / Bill number – backend jodega jab aap WhatsApp bhejenge (customer_id
                  ke saath).
                </p>
              </div>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onWhatsApp}
              className="rounded-xl bg-[#22C55E] py-3 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              WhatsApp reminder + Razorpay link
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onPaymentLink}
              className="rounded-xl border border-violet-200 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            >
              Copy payment link only
            </button>
            <button type="button" onClick={onClose} className="py-2 text-sm text-violet-600 hover:underline">
              Skip
            </button>
          </div>
          <TimelineItem tone="future" title="Din 7: Hindi voice call" meta="Auto-scheduled if no payment" />
          <TimelineItem tone="future" title="Din 14: Legal notice flag" meta="CA ko alert" />
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ tone, title, meta, body, highlight }) {
  return (
    <div className="relative flex gap-3 pb-6">
      <div
        className={cn(
          'relative z-[1] mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow',
          tone === 'done' && 'bg-emerald-500',
          tone === 'today' && 'bg-[#6C3BFF]',
          tone === 'future' && 'border-dashed border-violet-300 bg-white'
        )}
      />
      <div className="absolute bottom-0 left-[5px] top-3 w-px bg-violet-200" aria-hidden />
      <div className={cn('min-w-0 flex-1 rounded-xl px-3 py-2', highlight && 'bg-violet-50')}>
        <p className="text-sm font-semibold text-violet-950">{title}</p>
        <p className="text-xs text-violet-600">{meta}</p>
        {body && <p className="mt-1 text-xs italic text-violet-700">{body}</p>}
      </div>
    </div>
  )
}

import { X } from 'lucide-react'
import { formatInr } from '../lib/collections'
import { lateRiskPct } from './CollectionQueueList'
import { cn } from '../lib/utils'

/**
 * Per-customer collections timeline — past touch, today suggestion, future ladder (demo + product).
 */
export function CustomerCollectionTimeline({ row, onClose, onWhatsApp, onPaymentLink, busy }) {
  if (!row) return null
  const pct = lateRiskPct(row)
  const high = pct >= 55

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

        <div className="space-y-0 px-5 py-4">
          <TimelineItem
            tone="done"
            title="WhatsApp reminder bheja"
            meta="3 din pehle"
            body='"Aapka payment pending hai…"'
          />
          <TimelineItem
            tone="today"
            title="Aaj: Follow-up + invoice PDF"
            meta="Suggested action · Tap below"
            highlight
          />
          <div className="flex flex-col gap-2 pb-2 pl-8">
            <button
              type="button"
              disabled={busy}
              onClick={onWhatsApp}
              className="rounded-xl bg-[#22C55E] py-3 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              PDF ke saath WhatsApp karo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onPaymentLink}
              className="rounded-xl border border-violet-200 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            >
              Payment link
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

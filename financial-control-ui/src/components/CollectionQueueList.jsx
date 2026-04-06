import { MessageCircle, Phone } from 'lucide-react'
import { formatInr } from '../lib/collections'
import { cn } from '../lib/utils'
import { useTr } from '../hooks/useTr'

function initials(name) {
  const s = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (s || '?').toUpperCase().slice(0, 2)
}

/** Late-payment risk % – inverse of pay-this-week score when present. */
export function lateRiskPct(row) {
  const p = row.payThisWeek
  if (p != null && !Number.isNaN(Number(p))) return Math.round(100 * (1 - Math.min(1, Math.max(0, Number(p)))))
  const late = Number(row.days_late ?? 0)
  return Math.min(95, 18 + late * 8)
}

function riskBarClass(pct) {
  if (pct >= 60) return 'bg-red-500'
  if (pct >= 35) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function CollectionQueueList({
  rows,
  busyKey,
  onMessage,
  onCall,
  onOpenTimeline,
  title,
  subtitle,
  totalDueLabel,
}) {
  const t = useTr()
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className="rounded-2xl border border-violet-200/90 bg-white/95 shadow-md shadow-violet-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-violet-950">{title}</h2>
          {subtitle && <p className="text-xs text-violet-600/80">{subtitle}</p>}
        </div>
        <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-800">
          {totalDueLabel} {formatInr(total)} {t('बकाया', 'due', { hinglish: 'bakaya' })}
        </span>
      </div>
      <ul className="divide-y divide-violet-50">
        {rows.map((row, idx) => {
          const pct = lateRiskPct(row)
          const b = busyKey?.(row)
          return (
            <li key={`${row.name}-${idx}`} className="px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => onOpenTimeline?.(row)}
                className="flex w-full gap-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-200 to-violet-100 text-sm font-bold text-violet-900">
                  {initials(row.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-violet-950">{row.name}</span>
                    <span
                      className={cn(
                        'text-lg font-bold tabular-nums',
                        pct >= 60 && 'text-red-600',
                        pct >= 35 && pct < 60 && 'text-amber-700',
                        pct < 35 && 'text-emerald-700'
                      )}
                    >
                      {formatInr(row.amount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100">
                      <div
                        className={cn('h-full rounded-full transition-all', riskBarClass(pct))}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-violet-700">
                      {pct}% {t('देरी जोखिम', 'late risk', { hinglish: 'deri jokhim' })}
                    </span>
                  </div>
                </div>
              </button>
              <div className="mt-3 flex justify-end gap-2 pl-14">
                <button
                  type="button"
                  disabled={!!b}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onMessage(row)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-900 shadow-sm hover:bg-violet-50 disabled:opacity-50"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  {t('वॉट्सऐप', 'WA', { hinglish: 'WhatsApp' })}
                </button>
                <button
                  type="button"
                  disabled={!!b}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onCall(row)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-950 shadow-sm hover:bg-violet-50 disabled:opacity-50"
                >
                  <Phone className="h-4 w-4" />
                  {t('कॉल', 'Call', { hinglish: 'Call' })}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

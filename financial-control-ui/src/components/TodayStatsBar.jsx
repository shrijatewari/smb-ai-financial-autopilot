import { useEffect, useMemo, useRef, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatInr } from '../lib/collections'
import { fetchLedgerSummary } from '../services/api'
import { istDateString } from '../lib/dates'
import { cn } from '../lib/utils'
import { useTr } from '../hooks/useTr'

/** 3 quick stats + runway meter – uses snapshot + optional today ledger credit. */
export function TodayStatsBar({ snap, loading }) {
  const t = useTr()
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const queue = dc?.collection_queue ?? []
  const [todayInflow, setTodayInflow] = useState(null)
  const [inflowPayments, setInflowPayments] = useState(null)
  const prevRunwayRef = useRef(null)

  const receivableTotal = useMemo(
    () => queue.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [queue]
  )
  const customerCount = queue.length

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const d = istDateString()
        const data = await fetchLedgerSummary({ date_from: d, date_to: d, txn_type: 'credit' })
        if (cancelled) return
        setTodayInflow(data?.total_credit != null ? Number(data.total_credit) : 0)
        setInflowPayments(data?.count != null ? Number(data.count) : 0)
      } catch {
        if (!cancelled) {
          setTodayInflow(null)
          setInflowPayments(null)
        }
      }
    }
    if (!loading && snap) void load()
    return () => {
      cancelled = true
    }
  }, [loading, snap])

  const runwayDelta = useMemo(() => {
    if (daysNeg == null) return null
    const prev = prevRunwayRef.current
    if (prev == null) return null
    return prev - daysNeg
  }, [daysNeg])

  useEffect(() => {
    if (daysNeg != null) prevRunwayRef.current = daysNeg
  }, [daysNeg])

  const meterPct = useMemo(() => {
    if (daysNeg == null) return 55
    const d = Math.max(0, Math.min(30, daysNeg))
    return 100 - (d / 30) * 100
  }, [daysNeg])

  const runwayTone =
    daysNeg == null ? 'neutral' : daysNeg <= 7 ? 'critical' : daysNeg <= 14 ? 'warn' : 'ok'

  const dayWord = t('दिन', 'days')
  const customerWord =
    customerCount === 1 ? t('ग्राहक', 'customer') : t('ग्राहक', 'customers')
  const paymentWord =
    inflowPayments === 1 ? t('भुगतान', 'payment') : t('भुगतान', 'payments')

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-200/80 bg-white/90 shadow-sm">
      <div className="grid grid-cols-1 gap-px sm:grid-cols-3 sm:divide-x sm:divide-violet-100">
        <div className="p-4 px-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500 normal-case">
            {t('नकद रनवे', 'Cash runway')}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                'text-3xl font-bold tabular-nums',
                runwayTone === 'critical' && 'text-red-600',
                runwayTone === 'warn' && 'text-amber-700',
                runwayTone === 'ok' && 'text-emerald-700',
                runwayTone === 'neutral' && 'text-violet-900'
              )}
            >
              {daysNeg != null ? `${daysNeg} ${dayWord}` : '–'}
            </span>
            {runwayDelta != null && runwayDelta !== 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  runwayDelta > 0 ? 'text-red-600' : 'text-emerald-600'
                )}
              >
                {runwayDelta > 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {runwayDelta > 0
                  ? `↓ ${runwayDelta} ${dayWord} ${t('पिछले देखने से', 'vs last view')}`
                  : `↑ ${-runwayDelta} ${dayWord} ${t('पिछले देखने से', 'vs last view')}`}
              </span>
            )}
          </div>
        </div>
        <div className="p-4 px-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500 normal-case">
            {t('लंबित प्राप्य', 'Pending receivables')}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-violet-950">{formatInr(receivableTotal)}</p>
          <p className="mt-0.5 text-xs text-violet-600/80">
            {customerCount} {customerWord}
          </p>
        </div>
        <div className="p-4 px-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500 normal-case">
            {t('आज का आगमन', "Today's inflow")}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">
            {todayInflow != null ? formatInr(todayInflow) : '–'}
          </p>
          <p className="mt-0.5 text-xs text-violet-600/80">
            {inflowPayments != null ? `${inflowPayments} ${paymentWord}` : t('लेजर', 'ledger')}
          </p>
        </div>
      </div>
      <div className="border-t border-violet-100 px-4 py-3 sm:px-5">
        <div className="mb-1 flex justify-between text-[10px] font-medium text-violet-500">
          <span>{t('सुरक्षित क्षेत्र', 'Safe zone')}</span>
          <span>{t('गंभीर', 'Critical')}</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-500">
          <div
            className="absolute top-1/2 -mt-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#6C3BFF] shadow-md"
            style={{ left: `${meterPct}%` }}
            title={daysNeg != null ? `~${daysNeg} ${t('दिन', 'days')}` : t('रनवे', 'Runway')}
          />
        </div>
      </div>
    </div>
  )
}

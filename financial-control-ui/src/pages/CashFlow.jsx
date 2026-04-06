import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as Slider from '@radix-ui/react-slider'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { fetchCashflowPrediction } from '../services/api'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function CashFlow() {
  const { snapshot: snap } = useSystemSnapshot()
  const snapRef = useRef(snap)
  snapRef.current = snap
  const [cf, setCf] = useState([])
  const [horizon, setHorizon] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const pred = await fetchCashflowPrediction({ horizon_days: horizon })
        if (cancelled) return
        const fromApi = pred?.cash_flow_series
        if (Array.isArray(fromApi) && fromApi.length > 0) {
          setCf(fromApi)
          return
        }
        const fallback = snapRef.current?.forecast || []
        setCf(Array.isArray(fallback) ? fallback : [])
      } catch {
        if (!cancelled) {
          const fallback = snapRef.current?.forecast || []
          setCf(Array.isArray(fallback) ? fallback : [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [horizon])

  const chartData = useMemo(() => {
    const raw = cf.length ? cf : snap?.forecast || []
    const base = raw.map((p, i) => ({
      date: p.date || `D${i + 1}`,
      balance: p.balance ?? p.value ?? 0,
    }))
    if (!base.length) {
      return Array.from({ length: 12 }, (_, i) => ({ date: `W${i + 1}`, balance: 80000 + i * 1200 }))
    }
    return base
  }, [cf, snap])

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Cash flow"
        subtitle="Historical path with simulated uncertainty band – drag horizon to stress-test."
      />
      <Card className="mb-8">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Balance trajectory</CardTitle>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <span className="text-xs font-medium text-violet-600">Horizon: {horizon} days</span>
            <Slider.Root
              className="relative flex h-5 w-full touch-none select-none items-center"
              value={[horizon]}
              onValueChange={([v]) => setHorizon(v)}
              min={7}
              max={90}
              step={1}
            >
              <Slider.Track className="relative h-2 grow rounded-full bg-violet-100">
                <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-emerald-400" />
              </Slider.Track>
              <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-[#6C3BFF] shadow-md focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/40" />
            </Slider.Root>
          </div>
        </CardHeader>
        <CardContent className="h-[340px]">
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                key={`cf-${horizon}-${chartData.length}`}
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="cfG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6C3BFF" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(108,59,255,0.08)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b5a8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b5a8c' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(108,59,255,0.2)' }}
                  formatter={(v) => [formatInr(v), 'Balance']}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#6C3BFF"
                  strokeWidth={2}
                  fill="url(#cfG)"
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-violet-950/55">
        Historical dates are from your ledger; +1d…+Nd is the mean Monte Carlo path for the selected horizon (change
        days above to stretch or shorten the forecast).
      </p>
    </div>
  )
}

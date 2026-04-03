import { useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { fetchSimulation, fetchSystemState } from '../services/api'

function binSamples(samples, bins = 32) {
  if (!samples?.length) return []
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const w = (max - min || 1) / bins
  const out = Array.from({ length: bins }, (_, i) => ({
    x: min + (i + 0.5) * w,
    c: 0,
  }))
  for (const v of samples) {
    let i = Math.floor((v - min) / w)
    if (i >= bins) i = bins - 1
    if (i < 0) i = 0
    out[i].c += 1
  }
  return out.map((b, i) => ({ i, density: b.c, x: b.x }))
}

export default function Predictions() {
  const [snap, setSnap] = useState(null)
  const [sim, setSim] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const [s, sm] = await Promise.all([fetchSystemState(), fetchSimulation({ paths: 1200 })])
        if (!c) {
          setSnap(s)
          setSim(sm)
        }
      } catch {
        if (!c) setSim(null)
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  const hist = binSamples(sim?.terminal_cash_samples || snap?.simulation || [], 36)
  const risk = sim?.probability_of_negative_cash ?? snap?.risk ?? 0

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Predictions"
        subtitle="Monte Carlo terminal cash distribution and horizon risk — same engine as the live control plane."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Horizon risk</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-2">
                <p className="text-4xl font-semibold tabular-nums text-[#6C3BFF]">{(100 * risk).toFixed(1)}%</p>
                <p className="text-sm text-violet-950/60">P(negative cash at least once in horizon)</p>
                <p className="text-xs text-violet-950/50">
                  Expected end cash (sim): {sim?.expected_cash != null ? `₹${Math.round(sim.expected_cash).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Terminal cash distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hist}>
                  <defs>
                    <linearGradient id="predG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 12 }}
                    formatter={(v) => [v, 'Paths']}
                  />
                  <Area type="monotone" dataKey="density" stroke="#6C3BFF" fill="url(#predG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

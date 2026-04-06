import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useSystemSnapshot } from '../context/SystemStreamContext'

function RiskMeter({ value }) {
  const pct = Math.min(100, Math.max(0, (value || 0) * 100))
  const hue = 140 - pct * 1.2
  return (
    <div className="relative mx-auto flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(108,59,255,0.12)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={`hsl(${hue} 70% 45%)`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={329}
          initial={{ strokeDashoffset: 329 }}
          animate={{ strokeDashoffset: 329 - (329 * pct) / 100 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold tabular-nums text-violet-950">{pct.toFixed(1)}%</span>
        <span className="text-xs text-violet-600">stress risk</span>
      </div>
    </div>
  )
}

export default function Risk() {
  const { snapshot: snap, error: streamError } = useSystemSnapshot()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (snap != null || streamError) setLoading(false)
  }, [snap, streamError])

  const risk = snap?.risk ?? 0
  const expl = snap?.risk_explanation || ''

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader title="Risk" subtitle="Live probability of cash stress – narrated by the engine." />
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Risk meter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-8 pb-10 md:flex-row md:justify-center">
          {loading ? (
            <Skeleton className="h-56 w-56 rounded-full" />
          ) : (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <RiskMeter value={risk} />
            </motion.div>
          )}
          <div className="max-w-md text-sm leading-relaxed text-violet-950/75">
            {expl || 'Risk narrative appears when the control plane is connected.'}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

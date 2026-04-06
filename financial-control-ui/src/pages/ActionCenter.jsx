import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { fetchDecisions } from '../services/api'

export default function ActionCenter() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    fetchDecisions()
      .then((d) => {
        if (!c) setData(d)
      })
      .finally(() => {
        if (!c) setLoading(false)
      })
    return () => {
      c = true
    }
  }, [])

  const actions = data?.actions || []

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Action center"
        subtitle="Prioritized treasury moves from the decision engine – execute on the Twin home."
      />
      <div className="grid gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))
          : actions.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className="border-emerald-400/20 shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base capitalize">
                        <Zap className="h-4 w-4 text-emerald-500" />
                        {String(a.action || '').replace(/_/g, ' ')}
                      </CardTitle>
                      <p className="mt-2 text-sm text-violet-950/65">{a.reason}</p>
                    </div>
                    <div className="text-right text-xs text-violet-600">
                      <p>Impact score</p>
                      <p className="text-lg font-semibold text-emerald-600">
                        {a.confidence != null ? `${(a.confidence * 100).toFixed(0)}%` : '–'}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button asChild variant="success" size="sm">
                      <Link to="/">Open Twin – execute</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
        {!loading && actions.length === 0 && (
          <p className="text-sm text-violet-950/55">No queued actions – risk is within tolerance.</p>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { fetchGstCompliance, fetchGstSummary } from '../services/api'
import { MOCK_GST_FALLBACK } from '../lib/platformMocks'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function Gst() {
  const [gst, setGst] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const d = await fetchGstSummary()
        if (!c) setGst({ ...d, _source: 'summary' })
      } catch {
        try {
          const d = await fetchGstCompliance()
          if (!c) setGst({ ...d, _source: 'compliance' })
        } catch {
          if (!c) setGst({ ...MOCK_GST_FALLBACK })
        }
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="GST & compliance"
        subtitle="GST liability forecast from your BusinessProfile (GSTIN), return history, and turnover – aligned with Monte Carlo cash simulation on GET /dashboard. If APIs are unreachable, a demo card is shown from the platform mocks."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle>Estimated due</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-12 w-40" />
              ) : (
                <p className="text-4xl font-semibold tabular-nums text-violet-950">
                  {formatInr(gst?.estimated_liability_inr ?? gst?.gst_due)}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <CardTitle>Due date & notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-violet-950/75">
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  <p>
                    <span className="font-medium text-violet-900">Due by:</span>{' '}
                    {gst?.next_due_date || gst?.due_date || '–'}
                  </p>
                  {gst?.gstin && (
                    <p className="mt-1 font-mono text-xs text-violet-800">
                      GSTIN <span className="font-semibold">{gst.gstin}</span>
                    </p>
                  )}
                  {gst?.basis && (
                    <p className="mt-2 text-xs text-violet-600">Basis: {gst.basis}</p>
                  )}
                  {gst?._source === 'mock' && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                      Demo data – connect backend and save GSTIN for live GET /gst/summary.
                    </p>
                  )}
                  <p className="mt-2">{gst?.note ?? '–'}</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

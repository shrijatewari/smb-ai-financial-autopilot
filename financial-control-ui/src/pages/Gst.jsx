import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { fetchGstCompliance } from '../services/api'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function Gst() {
  const [gst, setGst] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    fetchGstCompliance()
      .then((d) => {
        if (!c) setGst(d)
      })
      .finally(() => {
        if (!c) setLoading(false)
      })
    return () => {
      c = true
    }
  }, [])

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="GST & compliance"
        subtitle="Plain-language view of estimated GST posture from onboarding and compliance engine."
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
                <p className="text-4xl font-semibold tabular-nums text-violet-950">{formatInr(gst?.gst_due)}</p>
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
                    <span className="font-medium text-violet-900">Due by:</span> {gst?.due_date || '—'}
                  </p>
                  <p className="mt-2">{gst?.note || '—'}</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { fetchPaytmTransactions, fetchSystemState } from '../services/api'
import { mockTransactionsFromState } from '../lib/mockData'
import { cn } from '../lib/utils'

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function Transactions() {
  const [snap, setSnap] = useState(null)
  const [paytm, setPaytm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, p] = await Promise.all([
          fetchSystemState(),
          fetchPaytmTransactions().catch(() => null),
        ])
        if (!cancelled) {
          setSnap(s)
          setPaytm(p)
        }
      } catch {
        if (!cancelled) setSnap({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const { rows: mockRows } = mockTransactionsFromState(snap || {})
  const paytmRows = (paytm?.transactions || []).map((t, i) => ({
    id: t.id || `p-${i}`,
    date: new Date().toISOString().slice(0, 10),
    description: t.description || 'Paytm',
    amount: t.amount,
    type: t.amount >= 0 ? 'credit' : 'debit',
    confidence: 0.91,
  }))

  const rows = paytmRows.length ? [...paytmRows, ...mockRows.slice(0, 2)] : mockRows
  const spark = rows.slice(0, 8).map((r, i) => ({ i, v: Math.abs(r.amount) }))

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Transactions"
        subtitle="Ledger lines with AI confidence — green inflow, red outflow, yellow uncertain."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Activity pulse</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6C3BFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(108,59,255,0.2)' }}
                    formatter={(v) => [formatInr(v), 'Amount']}
                  />
                  <Area type="monotone" dataKey="v" stroke="#6C3BFF" fill="url(#txFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insight</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-violet-950/70">
            {snap?.risk != null && (
              <p>
                Model estimates <span className="font-semibold text-violet-900">{(100 * snap.risk).toFixed(1)}%</span>{' '}
                cash stress in horizon — reconcile uncertain tags to improve confidence.
              </p>
            )}
            {!snap && !loading && <p>Connect data sources from the Twin home to enrich this view.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-100 bg-violet-50/40 text-xs uppercase tracking-wide text-violet-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-violet-50">
                      <td colSpan={5} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.map((r) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-violet-50/80 hover:bg-violet-50/30"
                    >
                      <td className="px-4 py-3 tabular-nums text-violet-950/80">{r.date}</td>
                      <td className="px-4 py-3 text-violet-950">{r.description}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            r.type === 'credit' ? 'success' : r.type === 'uncertain' ? 'warning' : 'danger'
                          }
                          className="capitalize"
                        >
                          {r.type === 'credit' ? 'sales' : r.type === 'uncertain' ? 'uncertain' : 'expense'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-violet-950">
                        {formatInr(r.amount)}
                      </td>
                      <td className="px-4 py-3 w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={(r.confidence || 0) * 100} className="flex-1" />
                          <span className="text-xs text-violet-600">{((r.confidence || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

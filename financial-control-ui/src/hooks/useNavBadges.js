import { useMemo } from 'react'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { daysUntilIsoDate } from '../lib/dates'

/**
 * Contextual sidebar badges – mirrors runway, queue, GST due, risk from live snapshot.
 */
export function useNavBadges() {
  const { snapshot: snap } = useSystemSnapshot()
  return useMemo(() => {
    const dc = snap?.daily_control
    const queue = dc?.collection_queue ?? []
    const n = queue.length
    const daysNeg = dc?.days_to_negative
    const risk = snap?.risk != null ? Number(snap.risk) : null
    const gst = snap?.dashboard_context?.gst

    let aaj = null
    if (daysNeg != null && daysNeg <= 7) aaj = 'URGENT'
    else if (daysNeg != null && daysNeg <= 14) aaj = 'SOON'
    else if (risk != null && risk > 0.35) aaj = 'RISK'

    const people = n > 0 ? `${n} due` : null

    let gstBadge = null
    if (gst?.next_due_date) {
      const d = daysUntilIsoDate(gst.next_due_date)
      if (d != null && d >= 0) gstBadge = `${d} din`
      else if (d != null && d < 0) gstBadge = 'DUE'
    }

    let riskBadge = null
    if (risk != null) {
      if (risk > 0.35) riskBadge = 'HIGH'
      else if (risk > 0.22) riskBadge = 'WATCH'
    }

    return {
      '/': aaj,
      '/people': people,
      '/gst': gstBadge,
      '/risk': riskBadge,
    }
  }, [snap])
}

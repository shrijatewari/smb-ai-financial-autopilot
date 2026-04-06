import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { fetchCollectionCustomers } from '../services/api'
import { useUiStore } from '../store/uiStore'
import { playCoinClink } from '../lib/playCoinSound'

/** Map customer id → total_due (paise-scale INR as float). */
function customersToMap(items) {
  const m = new Map()
  for (const c of items || []) {
    const id = c.id
    if (id == null) continue
    m.set(Number(id), Number(c.total_due) || 0)
  }
  return m
}

/**
 * When a customer's `total_due` drops from positive to zero (payment / settlement),
 * play a coin sound and highlight the notification bell.
 *
 * Note: `daily_control.collection_queue` is engine/demo-shaped; real khata uses GET /collections/customers.
 */
export function CollectionClearedNotifier() {
  const { token } = useAuth()
  const { snapshot } = useSystemSnapshot()
  const prevRef = useRef(null)
  const throttleRef = useRef(0)
  const setBellPaymentHighlight = useUiStore((s) => s.setBellPaymentHighlight)

  const runDiff = useCallback(async () => {
    const now = Date.now()
    if (now - throttleRef.current < 2000) return
    throttleRef.current = now
    try {
      const data = await fetchCollectionCustomers()
      const items = data.items || data.customers || []
      const next = customersToMap(items)
      if (prevRef.current === null) {
        prevRef.current = next
        return
      }
      const prev = prevRef.current
      let hadClear = false
      prev.forEach((prevDue, id) => {
        if (prevDue <= 0) return
        const nDue = next.get(id)
        if (nDue === undefined || nDue === 0) hadClear = true
      })
      prevRef.current = next
      if (!hadClear) return
      void playCoinClink()
      setBellPaymentHighlight(true)
    } catch {
      /* offline / API error – ignore */
    }
  }, [setBellPaymentHighlight])

  useEffect(() => {
    if (!token) {
      prevRef.current = null
      return
    }
    void runDiff()
  }, [token, runDiff])

  /** Engine tick often follows ledger / webhook updates – refetch soon after. */
  const tick = snapshot?.meta?.tick
  useEffect(() => {
    if (!token || tick == null) return
    void runDiff()
  }, [token, tick, runDiff])

  useEffect(() => {
    if (!token) return
    const id = window.setInterval(() => void runDiff(), 12000)
    return () => window.clearInterval(id)
  }, [token, runDiff])

  return null
}

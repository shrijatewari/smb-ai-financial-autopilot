/**
 * Month-over-month debit totals by category from GET /transactions/ledger rows.
 */

function ymdParts(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
}

/** @param {Array<{ date?: string, amount?: number, type?: string, category?: string }>} transactions */
export function computeDebitCategoryMom(transactions, referenceDate = new Date()) {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const curYm = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 15)
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const prevMap = {}
  const curMap = {}
  for (const t of transactions || []) {
    if ((t.type || '').toLowerCase() !== 'debit') continue
    const p = ymdParts(t.date)
    if (!p) continue
    const ym = `${p.y}-${String(p.mo).padStart(2, '0')}`
    if (ym !== prevYm && ym !== curYm) continue
    const cat = String(t.category || 'uncategorized').trim() || 'uncategorized'
    const amt = Math.abs(Number(t.amount) || 0)
    if (ym === prevYm) prevMap[cat] = (prevMap[cat] || 0) + amt
    if (ym === curYm) curMap[cat] = (curMap[cat] || 0) + amt
  }

  const cats = new Set([...Object.keys(prevMap), ...Object.keys(curMap)])
  const rows = []
  for (const c of cats) {
    const a = prevMap[c] || 0
    const b = curMap[c] || 0
    if (a === 0 && b === 0) continue
    let deltaPct = 0
    if (a === 0) deltaPct = b > 0 ? 100 : 0
    else deltaPct = Math.round(((b - a) / a) * 100)
    rows.push({
      category: c,
      deltaPct,
      direction: deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat',
      prevTotal: a,
      curTotal: b,
    })
  }
  rows.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct))
  return { rows: rows.slice(0, 8), prevYm, curYm }
}

/**
 * @param {typeof import('../services/api.js').fetchLedgerTransactions} fetchLedger
 */
export async function fetchExpenseCategoryMom(fetchLedger) {
  const ref = new Date()
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m + 1, 0)

  const txs = []
  let offset = 0
  for (;;) {
    const res = await fetchLedger({
      date_from: fmt(start),
      date_to: fmt(end),
      txn_type: 'debit',
      limit: 500,
      offset,
    })
    const batch = res.transactions || []
    txs.push(...batch)
    if (batch.length < 500) break
    offset += 500
    if (offset > 15000) break
  }

  return { ...computeDebitCategoryMom(txs, ref), totalTxns: txs.length }
}

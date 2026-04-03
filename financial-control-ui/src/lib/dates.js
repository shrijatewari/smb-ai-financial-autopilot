/** YYYY-MM-DD for "today" in Asia/Kolkata (ledger filters use UTC day bounds; good enough for UI). */
export function istDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) {
    const x = new Date()
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  return `${y}-${m}-${d}`
}

/** Whole days from today (IST) until an ISO date string `yyyy-mm-dd`; negative if past. */
export function daysUntilIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const todayStr = istDateString()
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const today = new Date(Date.UTC(ty, tm - 1, td))
  return Math.round((target - today) / (24 * 60 * 60 * 1000))
}

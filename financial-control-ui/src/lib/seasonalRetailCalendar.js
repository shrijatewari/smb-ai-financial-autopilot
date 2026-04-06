/**
 * Next upcoming India retail–relevant dates (approximate Gregorian; planning hints only).
 * Does not drive the Monte Carlo engine – UI context for shopkeepers.
 */

function stripTime(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Fixed catalogue – extend yearly. Dates are indicative for merchandising / staffing. */
const EVENTS = [
  { name: 'Republic Day · short week', date: '2026-01-26' },
  { name: 'Holi · colour / snack stock', date: '2026-03-14' },
  { name: 'Good Friday', date: '2026-04-03' },
  { name: 'Akshaya Tritiya · gold / gift uplift', date: '2026-04-25' },
  { name: 'Eid · festive cluster', date: '2026-03-31' },
  { name: 'Monsoon · FMCG / staples shift', date: '2026-07-15' },
  { name: 'Independence Day', date: '2026-08-15' },
  { name: 'Raksha Bandhan · gifting', date: '2026-08-19' },
  { name: 'Ganesh Chaturthi · sweets & FMCG', date: '2026-09-14' },
  { name: 'Navratri / Dussehra', date: '2026-10-01' },
  { name: 'Diwali · peak shopping', date: '2026-11-08' },
  { name: 'Christmas · gifting', date: '2026-12-25' },
  { name: 'Republic Day · short week', date: '2027-01-26' },
  { name: 'Holi', date: '2027-03-03' },
  { name: 'Diwali', date: '2027-10-29' },
]

/**
 * @returns {{ nextEvent: string, daysAway: number, hint: string, eventDate: string }}
 */
export function getNextSeasonalRetailEvent(now = new Date()) {
  const t0 = stripTime(now)
  const enriched = EVENTS.map((e) => {
    const t = new Date(`${e.date}T12:00:00`)
    const daysAway = Math.ceil((t - t0) / 86400000)
    return { ...e, t, daysAway }
  })
  const future = enriched.filter((e) => e.daysAway >= 0).sort((a, b) => a.t - b.t)
  const next = future[0] || enriched.sort((a, b) => b.t - a.t)[0]
  if (!next) {
    return {
      nextEvent: '–',
      daysAway: 0,
      hint: 'Add dates to seasonalRetailCalendar.js',
      eventDate: '',
    }
  }
  const hint =
    next.daysAway <= 14
      ? 'Nearby cluster – watch stock, staffing, and supplier prepayments.'
      : 'Model variance in twin still uses ledger + simulation only; this card is a planning hint.'
  return {
    nextEvent: next.name,
    daysAway: Math.max(0, next.daysAway),
    hint,
    eventDate: next.date,
  }
}

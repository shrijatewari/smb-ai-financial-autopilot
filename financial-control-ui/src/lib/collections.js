/** Shared helpers for collection / Today / People screens (action-first UX). */

export function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function normalizePhone10(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length >= 10) return d.slice(-10)
  return ''
}

const MOCK_LINE_ITEMS = [
  'milk and eggs',
  'rice, dal and oil',
  'kirana supplies',
  "last week's stock",
  'daily essentials',
  'pending bill items',
]

export function mockLineItemsForCustomer(name) {
  const key = name.split('(')[0].trim() || 'x'
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 997
  const i = h % MOCK_LINE_ITEMS.length
  const j = (h + 3) % MOCK_LINE_ITEMS.length
  return h % 2 === 0 ? MOCK_LINE_ITEMS[i] : `${MOCK_LINE_ITEMS[i]} and ${MOCK_LINE_ITEMS[j]}`
}

export function firstNameFromCustomer(customer) {
  return customer.split('(')[0].trim().split(/\s+/)[0] || 'Customer'
}

export function buildWhatsappCollectionMessage(customer, amount, tone) {
  const first = firstNameFromCustomer(customer)
  const items = mockLineItemsForCustomer(customer)
  const rs = Math.round(Number(amount) || 0)
  if (tone === 'friendly') {
    return `Hi ${first}, ₹${rs} pending hai — ${items}. Jab bhi ho clear kar dena. Thanks!`
  }
  return `Namaste ${first}, please clear ₹${rs} towards ${items} on your account. Thank you.`
}

/** Hindi script-friendly line for Twilio / voice (short). */
export function buildHindiPaymentScript(customer, amount) {
  const first = firstNameFromCustomer(customer)
  const rs = Math.round(Number(amount) || 0)
  return `Namaste ${first} ji, ${rs} rupaye payment pending hai. Kripya aaj complete karne ki koshish karein. Dhanyavaad.`
}

export function openWhatsAppDraft(phone10, message) {
  const url = `https://wa.me/91${phone10}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openTelDialer(phone10) {
  const a = document.createElement('a')
  a.href = `tel:+91${phone10}`
  a.setAttribute('rel', 'noopener')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

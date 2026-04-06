/** Shared helpers for collection / Today / People screens (action-first UX). */

export function formatInr(n) {
  if (n == null || Number.isNaN(n)) return '–'
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

/**
 * Matches backend `build_khaata_bill_proof_message` / `generate_payment_message` – Razorpay URL on the last line.
 * Use a real `paymentLink` from POST /execute/payment-link when possible.
 * Without keys the backend returns a docs URL – not a fake rzp.io path (those resolve to empty JSON).
 */
const DEMO_PAYMENT_LINK_FALLBACK = 'https://razorpay.com/docs/payment-links/'

export function buildKhaataWhatsappDraftMessage({
  customer,
  amount,
  shopName = 'Hamari dukaan',
  paymentLink,
  billDate = '–',
  billNumber = '–',
}) {
  const first = firstNameFromCustomer(customer)
  const totalInt = Math.round(Number(amount) || 0)
  const fmt = (n) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n) || 0)
  const link = paymentLink || DEMO_PAYMENT_LINK_FALLBACK
  const itemsDesc = mockLineItemsForCustomer(customer)
  const bullets = `• ${itemsDesc} – ₹${fmt(totalInt)}`
  return (
    `Namaste ${first} ji,\n\n` +
    `${shopName} se aapka ${totalInt} rupaye baaki hai.\n\n` +
    `Aapki khareedari ki details:\n` +
    `${bullets}\n\n` +
    `Kul rakam: ₹${fmt(totalInt)}\n` +
    `Tarikh: ${billDate}\n` +
    `Bill number: ${billNumber}\n\n` +
    `Kripya jald se jald bhej dijiye. Shukriya 🙏\n\n` +
    `${link}`
  )
}

/** Formal English – same structure; payment link last. */
export function buildFormalKhaataEnglishDraft({
  customer,
  amount,
  shopName = 'Our store',
  paymentLink,
  billDate = '–',
  billNumber = '–',
}) {
  const first = firstNameFromCustomer(customer)
  const totalInt = Math.round(Number(amount) || 0)
  const fmt = (n) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n) || 0)
  const link = paymentLink || DEMO_PAYMENT_LINK_FALLBACK
  const itemsDesc = mockLineItemsForCustomer(customer)
  return (
    `Namaste ${first},\n\n` +
    `Your outstanding at ${shopName} is ₹${fmt(totalInt)}.\n\n` +
    `Purchase details:\n` +
    `• ${itemsDesc} – ₹${fmt(totalInt)}\n\n` +
    `Total: ₹${fmt(totalInt)}\n` +
    `Date: ${billDate}\n` +
    `Bill number: ${billNumber}\n\n` +
    `Please pay at your earliest. Thank you.\n\n` +
    `${link}`
  )
}

/**
 * @param {string} tone - 'friendly' (Hindi khaata) | 'formal' (English)
 * @param {string} [paymentLink] - from Razorpay; falls back to demo URL if omitted
 */
export function buildWhatsappCollectionMessage(customer, amount, tone, paymentLink) {
  const link = paymentLink || DEMO_PAYMENT_LINK_FALLBACK
  if (tone === 'formal') {
    return buildFormalKhaataEnglishDraft({ customer, amount, paymentLink: link })
  }
  return buildKhaataWhatsappDraftMessage({ customer, amount, paymentLink: link })
}

/** Hindi script-friendly line for Twilio / voice (short). */
export function buildHindiPaymentScript(customer, amount) {
  const first = firstNameFromCustomer(customer)
  const rs = Math.round(Number(amount) || 0)
  return `Namaste ${first} ji, ${rs} rupaye payment pending hai. Kripya aaj complete karne ki koshish karein. Dhanyavaad.`
}

/**
 * Call synchronously from a click handler, then assign the wa.me URL after async work.
 * Browsers block window.open() after await (no "user gesture"), which made WhatsApp look "broken".
 */
export function openUserGestureBlankTab() {
  if (typeof window === 'undefined') return null
  try {
    return window.open('about:blank', '_blank')
  } catch {
    return null
  }
}

export function navigateTabOrOpenWhatsApp(tab, phone10, message) {
  const d = normalizePhone10(phone10)
  if (!d || d.length < 10) return
  const url = `https://wa.me/91${d}?text=${encodeURIComponent(message)}`
  if (tab && !tab.closed) {
    try {
      tab.location.href = url
      return
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openWhatsAppDraft(phone10, message) {
  navigateTabOrOpenWhatsApp(null, phone10, message)
}

export function openTelDialer(phone10) {
  const d = normalizePhone10(phone10)
  if (!d || d.length < 10) return
  const href = `tel:+91${d}`
  try {
    window.location.href = href
  } catch {
    const a = document.createElement('a')
    a.href = href
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

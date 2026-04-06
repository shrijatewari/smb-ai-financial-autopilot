/** Client-side supplement when ledger endpoints are limited – blends with live /system/state in UI. */

export function mockTransactionsFromState(snap) {
  const cash = snap?.cash ?? 125000
  const risk = snap?.risk ?? 0.18
  const rows = [
    {
      demo: true,
      id: 'm1',
      date: new Date().toISOString().slice(0, 10),
      description: 'UPI settlement – counter sales',
      amount: 18400,
      type: 'credit',
      confidence: 0.94,
      source: 'sms',
      category: 'sale',
    },
    {
      demo: true,
      id: 'm-rzp',
      date: new Date().toISOString().slice(0, 10),
      description: 'Razorpay payment captured (webhook)',
      amount: 2400,
      type: 'credit',
      confidence: 0.99,
      source: 'razorpay_webhook',
      category: 'collection',
    },
    {
      demo: true,
      id: 'm2',
      date: new Date().toISOString().slice(0, 10),
      description: 'Supplier – dry goods',
      amount: -9200,
      type: 'debit',
      confidence: 0.88,
      source: 'sms',
      category: 'supplier',
    },
    {
      demo: true,
      id: 'm-aa',
      date: new Date().toISOString().slice(0, 10),
      description: 'AA: UPI / IMPS sample (linked bank)',
      amount: 1900,
      type: 'debit',
      confidence: 0.95,
      source: 'account_aggregator',
      category: 'bank_aa',
    },
    {
      demo: true,
      id: 'm3',
      date: new Date().toISOString().slice(0, 10),
      description: 'Unlabeled transfer',
      amount: 2100,
      type: 'uncertain',
      confidence: 0.52,
      source: 'api',
      category: 'unknown',
    },
  ]
  return { rows, meta: { cash, risk } }
}

export const mockInventory = [
  { sku: 'SKU-01', name: 'Rice 25kg', stockPct: 72, status: 'ok' },
  { sku: 'SKU-02', name: 'Cooking oil', stockPct: 28, status: 'low' },
  { sku: 'SKU-03', name: 'Snacks mix', stockPct: 55, status: 'ok' },
]

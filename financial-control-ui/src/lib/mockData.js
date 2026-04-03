/** Client-side supplement when ledger endpoints are limited — blends with live /system/state in UI. */

export function mockTransactionsFromState(snap) {
  const cash = snap?.cash ?? 125000
  const risk = snap?.risk ?? 0.18
  const rows = [
    {
      id: 'm1',
      date: new Date().toISOString().slice(0, 10),
      description: 'UPI settlement — counter sales',
      amount: 18400,
      type: 'credit',
      confidence: 0.94,
    },
    {
      id: 'm2',
      date: new Date().toISOString().slice(0, 10),
      description: 'Supplier — dry goods',
      amount: -9200,
      type: 'debit',
      confidence: 0.88,
    },
    {
      id: 'm3',
      date: new Date().toISOString().slice(0, 10),
      description: 'Unlabeled transfer',
      amount: 2100,
      type: 'uncertain',
      confidence: 0.52,
    },
  ]
  return { rows, meta: { cash, risk } }
}

export const mockInventory = [
  { sku: 'SKU-01', name: 'Rice 25kg', stockPct: 72, status: 'ok' },
  { sku: 'SKU-02', name: 'Cooking oil', stockPct: 28, status: 'low' },
  { sku: 'SKU-03', name: 'Snacks mix', stockPct: 55, status: 'ok' },
]

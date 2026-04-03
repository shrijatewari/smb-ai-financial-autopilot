import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  formatInr,
  normalizePhone10,
  openTelDialer,
  openWhatsAppDraft,
} from '../lib/collections'
import {
  fetchSystemState,
  getApiErrorMessage,
  postTwilioVoiceCall,
  postWhatsappReminder,
} from '../services/api'

const DEFAULT_PHONE = '9004930401'

export default function People() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState(DEFAULT_PHONE)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    try {
      const snap = await fetchSystemState()
      const q = snap?.daily_control?.collection_queue ?? []
      setRows(q)
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  const phone10 = normalizePhone10(phone) || DEFAULT_PHONE

  async function onMessage(row) {
    try {
      await postWhatsappReminder({
        customer: row.name,
        phone: phone10,
        amount: row.amount,
        tone: 'friendly',
      })
      setToast({ type: 'ok', text: `WhatsApp → ${row.name}` })
    } catch {
      openWhatsAppDraft(phone10, buildWhatsappCollectionMessage(row.name, row.amount, 'friendly'))
      setToast({ type: 'warn', text: 'API fail — draft khola' })
    }
    setTimeout(() => setToast(null), 6000)
  }

  async function onCall(row) {
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) openTelDialer(phone10)
      setToast({ type: res.mock ? 'warn' : 'ok', text: res.mock ? 'Dialer / demo' : 'Call queued' })
    } catch (e) {
      openTelDialer(phone10)
      setToast({ type: 'warn', text: getApiErrorMessage(e) })
    }
    setTimeout(() => setToast(null), 6000)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 pb-24 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-violet-950">Dues — log</h1>
            <p className="text-sm text-violet-800/70">Seed / engine se aata hai — har row par message ya call</p>
          </div>
          <Link to="/" className="text-sm font-medium text-[#6C3BFF] hover:underline">
            ← Aaj wapas
          </Link>
        </div>

        <label className="mb-4 block text-xs text-violet-800/80">
          Default number (WhatsApp / call)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-violet-200 px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-100 bg-violet-50/80 text-xs uppercase tracking-wide text-violet-600">
                <th className="px-4 py-3">Kaun</th>
                <th className="px-4 py-3">Rashi</th>
                <th className="px-4 py-3">Late</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-violet-600">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-violet-600">
                    Abhi queue khali — engine data connect karo
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.name} className="border-b border-violet-50">
                    <td className="px-4 py-3 font-medium text-violet-950">{row.name}</td>
                    <td className="px-4 py-3 tabular-nums">{formatInr(row.amount)}</td>
                    <td className="px-4 py-3">{row.days_late}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-50 text-amber-900'
                        }`}
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void onMessage(row)}
                          className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-200"
                        >
                          Message
                        </button>
                        <button
                          type="button"
                          onClick={() => void onCall(row)}
                          className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-50"
                        >
                          Call
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {toast && (
          <p
            className={`fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
              toast.type === 'err'
                ? 'border-red-200 bg-red-50 text-red-900'
                : toast.type === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-violet-200 bg-white text-violet-950'
            }`}
          >
            {toast.text}
          </p>
        )}
      </div>
    </div>
  )
}

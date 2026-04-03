import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic, Phone, Sparkles, Users, MessageCircle } from 'lucide-react'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  formatInr,
  normalizePhone10,
  openTelDialer,
  openWhatsAppDraft,
} from '../lib/collections'
import {
  executeAction,
  fetchSystemState,
  getApiErrorMessage,
  postPaymentLink,
  postTwilioVoiceCall,
  postWhatsappReminder,
} from '../services/api'

const DEFAULT_PHONE = '9004930401'

function headlineFromSnap(snap) {
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const risk = snap?.risk
  if (daysNeg != null && daysNeg <= 14) {
    return { text: `⚠️ ${daysNeg} din mein paisa khatam ho sakta hai`, urgent: true }
  }
  if (risk != null && risk > 0.25) {
    return {
      text: `⚠️ Cash risk zyada hai — lagbhag ${(100 * risk).toFixed(0)}% chance stress ke saath`,
      urgent: true,
    }
  }
  if (daysNeg != null) {
    return { text: `Stress timing ~${daysNeg} din — collections follow karein`, urgent: false }
  }
  return { text: 'Aaj cash stable lag raha hai — phir bhi dues follow karein', urgent: false }
}

export default function Today() {
  const [snap, setSnap] = useState(null)
  const [error, setError] = useState(null)
  const [phone, setPhone] = useState(DEFAULT_PHONE)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchSystemState()
      setSnap(data)
      setError(null)
    } catch (e) {
      setError(getApiErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  const loading = snap == null && !error
  const dc = snap?.daily_control
  const primary = snap?.action
  const queue = dc?.collection_queue ?? []
  const meta = primary?.metadata || {}
  const collectAmount = Number(meta.suggested_amount ?? queue[0]?.amount ?? 2400)
  const collectName = String(meta.customer || queue[0]?.name || 'Customer')
  const act = primary?.action || 'collect_payment'
  const line = headlineFromSnap(snap)

  const phone10 = normalizePhone10(phone) || DEFAULT_PHONE

  async function onWhatsApp() {
    setBusy('wa')
    setToast(null)
    try {
      await postWhatsappReminder({
        customer: collectName,
        phone: phone10,
        amount: collectAmount,
        tone: 'friendly',
      })
      setToast({ type: 'ok', text: 'Reminder bheja gaya (WhatsApp / Meta API jab configured ho).' })
    } catch (e) {
      const msg = getApiErrorMessage(e)
      const draft = buildWhatsappCollectionMessage(collectName, collectAmount, 'friendly')
      openWhatsAppDraft(phone10, draft)
      setToast({ type: 'warn', text: `${msg} — WhatsApp draft khola.` })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  async function onCall() {
    setBusy('call')
    setToast(null)
    const script = buildHindiPaymentScript(collectName, collectAmount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) {
        openTelDialer(phone10)
        setToast({
          type: 'warn',
          text: res.detail || 'Twilio set nahi hai — phone dialer khola. Script: ' + script.slice(0, 80) + '…',
        })
      } else {
        setToast({ type: 'ok', text: `Call queue: ${res.sid || 'ok'}` })
      }
    } catch (e) {
      openTelDialer(phone10)
      setToast({ type: 'warn', text: getApiErrorMessage(e) + ' — dialer khola.' })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 12000)
    }
  }

  async function onSystemHandle() {
    setBusy('sys')
    setToast(null)
    try {
      const payRes = await postPaymentLink({
        amount: collectAmount,
        customer_name: collectName,
        phone: phone10,
      })
      const execPayload = { action: act, reference: `today-${Date.now()}` }
      if (act === 'collect_payment') {
        execPayload.amount = collectAmount
        execPayload.customer = collectName
      }
      await executeAction(execPayload)
      setToast({
        type: 'ok',
        text: 'System ne payment link + action log kiya.',
        link: payRes.payment_link,
      })
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 14000)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-violet-50/40 to-white px-4 pb-28 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
          Aaj kya karna hai
        </p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-4 text-center text-2xl font-bold leading-snug sm:text-3xl ${
            line.urgent ? 'text-red-700' : 'text-violet-950'
          }`}
        >
          {loading ? '…' : line.text}
        </motion.h1>

        <div className="mt-10 rounded-3xl border-2 border-violet-200/80 bg-white p-6 shadow-xl shadow-violet-500/10">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-violet-500">Ek kaam</p>
          <p className="mt-3 text-center text-xl font-semibold leading-snug text-violet-950">
            {loading ? '—' : `👉 ${collectName.split('(')[0].trim()} se ${formatInr(collectAmount)} lena hai`}
          </p>
          <label className="mt-6 flex flex-col gap-1 text-xs text-violet-800/80">
            <span className="font-medium">Customer ka number (10 digit)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 text-center text-lg font-mono tabular-nums text-violet-950"
              inputMode="numeric"
            />
          </label>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => void onWhatsApp()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#22C55E] py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-50"
          >
            <MessageCircle className="h-6 w-6" />
            {busy === 'wa' ? 'Bhej rahe hain…' : 'WhatsApp bhejo'}
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => void onCall()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-white py-4 text-lg font-bold text-violet-950 shadow-md transition hover:bg-violet-50 disabled:opacity-50"
          >
            <Phone className="h-6 w-6" />
            {busy === 'call' ? 'Call…' : 'Call karo (Hindi voice)'}
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => void onSystemHandle()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-violet-600 py-4 text-lg font-bold text-white shadow-lg shadow-violet-500/30 transition hover:opacity-95 disabled:opacity-50"
          >
            <Sparkles className="h-6 w-6" />
            {busy === 'sys' ? 'Ho raha hai…' : 'System ko handle karne do'}
          </button>
        </div>

        <Link
          to="/assistant?lang=hi"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 py-4 text-base font-semibold text-violet-900 transition hover:bg-violet-100"
        >
          <Mic className="h-6 w-6" />
          Awaz se poochho — mic
        </Link>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/people" className="flex items-center gap-1.5 font-medium text-[#6C3BFF] hover:underline">
            <Users className="h-4 w-4" />
            Saare log (dues)
          </Link>
          <Link to="/dashboard" className="font-medium text-violet-700/80 hover:underline">
            Poora dashboard →
          </Link>
        </div>

        {error && (
          <p className="mt-6 text-center text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {toast && (
          <div
            className={`fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'err'
                ? 'border-red-200 bg-red-50 text-red-900'
                : toast.type === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-violet-200 bg-white text-violet-950'
            }`}
          >
            <p>{toast.text}</p>
            {toast.link && (
              <a href={toast.link} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-medium text-blue-700 underline">
                Link kholo
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  normalizePhone10,
  openTelDialer,
  openWhatsAppDraft,
} from '../lib/collections'
import { getApiErrorMessage, postPaymentLink, postTwilioVoiceCall, postWhatsappReminder } from '../services/api'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { attachMockPayScores } from '../lib/platformMocks'
import { CollectionQueueList } from '../components/CollectionQueueList'
import { CustomerCollectionTimeline } from '../components/CustomerCollectionTimeline'

const DEFAULT_PHONE = '9004930401'

export default function People() {
  const { snapshot: snap } = useSystemSnapshot()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState(DEFAULT_PHONE)
  const [toast, setToast] = useState(null)
  const [creditMode, setCreditMode] = useState(false)
  const [timelineRow, setTimelineRow] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (snap == null) return
    try {
      const q = snap?.daily_control?.collection_queue ?? []
      setRows(attachMockPayScores(q))
      setCreditMode(!!snap?.dashboard_context?.flags?.show_credit_priority_list)
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
    } finally {
      setLoading(false)
    }
  }, [snap])

  const phone10 = normalizePhone10(phone) || DEFAULT_PHONE

  async function queueMessage(row) {
    setBusy('wa')
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
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function queueCall(row) {
    setBusy('call')
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) openTelDialer(phone10)
      setToast({ type: res.mock ? 'warn' : 'ok', text: res.mock ? 'Dialer / demo' : 'Call queued' })
    } catch (e) {
      openTelDialer(phone10)
      setToast({ type: 'warn', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 pb-24 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-violet-950">Log — paise lene wale</h1>
            <p className="text-sm text-violet-800/70">
              {creditMode
                ? 'Credit-heavy business: pehle in logon ko follow karein — har row par Message / Call'
                : 'Engine queue — har row par message ya call'}
            </p>
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

        {loading ? (
          <p className="py-12 text-center text-violet-600">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-violet-600">Abhi queue khali — engine data connect karo</p>
        ) : (
          <CollectionQueueList
            rows={rows}
            title="Aaj collect karein"
            subtitle="Ranked by engine — risk bar = late-payment risk"
            totalDueLabel="Total"
            busyKey={() => busy}
            onMessage={(row) => void queueMessage(row)}
            onCall={(row) => void queueCall(row)}
            onOpenTimeline={(row) => setTimelineRow(row)}
          />
        )}

        {timelineRow && (
          <CustomerCollectionTimeline
            row={timelineRow}
            busy={!!busy}
            onClose={() => setTimelineRow(null)}
            onWhatsApp={() => {
              void queueMessage(timelineRow)
              setTimelineRow(null)
            }}
            onPaymentLink={async () => {
              setBusy('sys')
              try {
                await postPaymentLink({
                  amount: Number(timelineRow.amount),
                  customer_name: timelineRow.name,
                  phone: phone10,
                })
                setToast({ type: 'ok', text: 'Payment link' })
              } catch (e) {
                setToast({ type: 'err', text: getApiErrorMessage(e) })
              } finally {
                setBusy(null)
                setTimelineRow(null)
              }
            }}
          />
        )}

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

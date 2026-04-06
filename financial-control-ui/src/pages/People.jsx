import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  normalizePhone10,
  openTelDialer,
  navigateTabOrOpenWhatsApp,
  openUserGestureBlankTab,
} from '../lib/collections'
import {
  fetchCollectionCustomers,
  getApiErrorMessage,
  postExecuteCollect,
  postPaymentLink,
  postTwilioVoiceCall,
} from '../services/api'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { attachMockPayScores } from '../lib/platformMocks'
import { CollectionQueueList } from '../components/CollectionQueueList'
import { CustomerCollectionTimeline } from '../components/CustomerCollectionTimeline'
import { useTr } from '../hooks/useTr'

const DEFAULT_PHONE = '9004930401'

export default function People() {
  const t = useTr()
  const { snapshot: snap } = useSystemSnapshot()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState(DEFAULT_PHONE)
  const [toast, setToast] = useState(null)
  const [creditMode, setCreditMode] = useState(false)
  const [timelineRow, setTimelineRow] = useState(null)
  const [busy, setBusy] = useState(null)
  const [customersByName, setCustomersByName] = useState({})

  useEffect(() => {
    fetchCollectionCustomers()
      .then((d) => {
        const m = {}
        for (const c of d.items || []) {
          m[String(c.name || '').trim().toLowerCase()] = c
        }
        setCustomersByName(m)
      })
      .catch(() => {})
  }, [])

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
    const waTab = openUserGestureBlankTab()
    setBusy('wa')
    const rowKey = String(row.name || '').trim().toLowerCase()
    const rowCust = customersByName[rowKey]
    try {
      const res = await postExecuteCollect({
        customer: row.name,
        phone: phone10,
        amount: row.amount,
        tone: 'friendly',
        ...(rowCust?.id ? { customer_id: rowCust.id } : {}),
      })
      const msg = buildWhatsappCollectionMessage(
        row.name,
        row.amount,
        'friendly',
        res.payment_link || undefined
      )
      navigateTabOrOpenWhatsApp(waTab, phone10, msg)
      setToast({
        type: 'ok',
        text: `WhatsApp + link → ${row.name}`,
        link: res.payment_link || undefined,
      })
    } catch {
      let payUrl = null
      try {
        const pay = await postPaymentLink({
          amount: row.amount,
          customer_name: row.name,
          phone: phone10,
          ...(rowCust?.id ? { customer_id: rowCust.id } : {}),
        })
        payUrl = pay.payment_link
      } catch {
        /* demo link in draft */
      }
      navigateTabOrOpenWhatsApp(
        waTab,
        phone10,
        buildWhatsappCollectionMessage(row.name, row.amount, 'friendly', payUrl || undefined)
      )
      setToast({
        type: 'warn',
        text: t(
          'API ठीक नहीं – ड्राफ़्ट खोला (लिंक जोड़ा)',
          'API failed – opened draft (link added)',
          { hinglish: 'API fail – draft khola (link added)' },
        ),
        link: payUrl || undefined,
      })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function queueCall(row) {
    setBusy('call')
    openTelDialer(phone10)
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      setToast({ type: res.mock ? 'warn' : 'ok', text: res.mock ? 'Dialer / demo' : 'Call queued' })
    } catch (e) {
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
            <h1 className="text-xl font-bold text-violet-950">
              {t(
                'लॉग – पैसे लेने वाले',
                'Log – receivables',
                { hinglish: 'Log – paise lene wale' },
              )}
            </h1>
            <p className="text-sm text-violet-800/70">
              {creditMode
                ? t(
                    'क्रेडिट-भारी व्यवसाय: पहले इन लोगों को फ़ॉलो करें – हर पंक्ति पर संदेश / कॉल',
                    'Credit-heavy business: follow these people first – Message / Call on each row',
                    {
                      hinglish:
                        'Credit-heavy business: pehle in logon ko follow karein – har row par Message / Call',
                    },
                  )
                : t(
                    'इंजन क़तार – हर पंक्ति पर संदेश या कॉल',
                    'Engine queue – message or call on each row',
                    { hinglish: 'Engine queue – har row par message ya call' },
                  )}
            </p>
          </div>
          <Link to="/" className="text-sm font-medium text-[#6C3BFF] hover:underline">
            {t('← आज वापस', '← Back to Today', { hinglish: '← Aaj wapas' })}
          </Link>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <label className="block min-w-0 flex-1 text-xs text-violet-800/80">
            {t(
              'डिफ़ॉल्ट नंबर (वॉट्सऐप / कॉल)',
              'Default number (WhatsApp / call)',
              { hinglish: 'Default number (WhatsApp / call)' },
            )}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-lg border border-violet-200 px-3 py-2 font-mono text-sm"
            />
          </label>
          <Link
            to="/export"
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full border border-[#6C3BFF]/45 bg-white px-4 py-2.5 text-sm font-semibold text-[#6C3BFF] shadow-sm ring-1 ring-[#6C3BFF]/10 transition hover:bg-[#6C3BFF]/10 sm:self-auto"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {t('डाउनलोड / निर्यात', 'Download / export', { hinglish: 'Download / export' })}
          </Link>
        </div>

        {loading ? (
          <p className="py-12 text-center text-violet-600">
            {t('लोड हो रहा है…', 'Loading…', { hinglish: 'Loading…' })}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-violet-600">
            {t(
              'अभी क़तार खाली – इंजन डेटा कनेक्ट करें',
              'Queue is empty – connect engine data',
              { hinglish: 'Abhi queue khali – engine data connect karo' },
            )}
          </p>
        ) : (
          <CollectionQueueList
            rows={rows}
            title={t(
              'आज वसूली करें',
              'Collect today',
              { hinglish: 'Aaj collect karein' },
            )}
            subtitle={t(
              'इंजन के अनुसार रैंक – रिस्क बार = देर से भुगतान का जोखिम',
              'Ranked by engine – risk bar = late-payment risk',
              { hinglish: 'Ranked by engine – risk bar = late-payment risk' },
            )}
            totalDueLabel={t('कुल', 'Total', { hinglish: 'Total' })}
            busyKey={() => busy}
            onMessage={(row) => void queueMessage(row)}
            onCall={(row) => void queueCall(row)}
            onOpenTimeline={(row) => setTimelineRow(row)}
          />
        )}

        {timelineRow && (
          <CustomerCollectionTimeline
            row={timelineRow}
            customerInfo={customersByName[String(timelineRow.name || '').trim().toLowerCase()]}
            busy={!!busy}
            onClose={() => setTimelineRow(null)}
            onWhatsApp={() => {
              void queueMessage(timelineRow)
              setTimelineRow(null)
            }}
            onPaymentLink={async () => {
              setBusy('sys')
              try {
                const key = String(timelineRow.name || '').trim().toLowerCase()
                const cust = customersByName[key]
                const res = await postPaymentLink({
                  amount: Number(timelineRow.amount),
                  customer_name: timelineRow.name,
                  phone: phone10,
                  ...(cust?.id ? { customer_id: cust.id } : {}),
                })
                const url = res.payment_link
                if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(url)
                }
                setToast({
                  type: 'ok',
                  text: t('पेमेंट लिंक कॉपी हो गया।', 'Payment link copied to clipboard.'),
                  link: url,
                })
              } catch (e) {
                setToast({ type: 'err', text: getApiErrorMessage(e) })
              } finally {
                setBusy(null)
                setTimelineRow(null)
                setTimeout(() => setToast(null), 12000)
              }
            }}
          />
        )}

        {toast && (
          <div
            className={`fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
              toast.type === 'err'
                ? 'border-red-200 bg-red-50 text-red-900'
                : toast.type === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-violet-200 bg-white text-violet-950'
            }`}
          >
            <p>{toast.text}</p>
            {toast.link && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <a href={toast.link} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">
                  {t('लिंक', 'Link')}
                </a>
                <button
                  type="button"
                  className="font-semibold text-violet-800 underline"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(toast.link)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {t('कॉपी', 'Copy')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

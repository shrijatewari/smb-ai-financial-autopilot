import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, ArrowRight, PlusCircle, FileText, MessageCircle, Phone, Link2, Download } from 'lucide-react'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'
import {
  formatInr,
  normalizePhone10,
  buildWhatsappCollectionMessage,
  openTelDialer,
  buildHindiPaymentScript,
  openUserGestureBlankTab,
  navigateTabOrOpenWhatsApp,
} from '../lib/collections'
import { getApiErrorMessage, postExecuteCollect, postPaymentLink, postTwilioVoiceCall } from '../services/api'
import { attachMockPayScores } from '../lib/platformMocks'

const DEFAULT_PHONE = '9004930401'

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const { snapshot: snap } = useSystemSnapshot()
  const navigate = useNavigate()
  const t = useTr()
  const [q, setQ] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const st = useUiStore.getState()
        st.setCommandPaletteOpen(!st.commandPaletteOpen)
      }
      if (e.key === 'Escape') useUiStore.getState().setCommandPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const phone10 = normalizePhone10(DEFAULT_PHONE) || DEFAULT_PHONE
  const queue = useMemo(() => attachMockPayScores(snap?.daily_control?.collection_queue ?? []), [snap])
  const gst = snap?.dashboard_context?.gst

  const filteredCustomers = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return queue.slice(0, 8)
    return queue.filter((r) => String(r.name).toLowerCase().includes(s)).slice(0, 12)
  }, [queue, q])

  const navHits = useMemo(() => {
    const s = q.trim().toLowerCase()
    const routes = [
      {
        k: 'export data download csv backup offline',
        to: '/export',
        hi: 'डेटा निर्यात',
        en: 'Export data',
        subHi: 'CSV / ऑफ़लाइन बैकअप',
        subEn: 'CSV & offline backup',
      },
      {
        k: 'people log dues',
        to: '/people',
        hi: 'लोग / बकाया',
        en: 'Log / Dues',
        subHi: 'पूरी वसूली कतार',
        subEn: 'Full collection queue',
      },
      {
        k: 'gst tax',
        to: '/gst',
        hi: 'GST सारांश',
        en: 'GST summary',
        subHi:
          gst?.next_due_date && gst?.estimated_liability_inr != null
            ? `अगला देय · अनुमान ${formatInr(gst.estimated_liability_inr)}`
            : 'अनुपालन और फ़ाइलिंग',
        subEn:
          gst?.next_due_date && gst?.estimated_liability_inr != null
            ? `Next due · est. ${formatInr(gst.estimated_liability_inr)}`
            : 'Compliance & filing',
      },
      {
        k: 'transaction len den',
        to: '/transactions',
        hi: 'लेन-देन',
        en: 'Transactions',
        subHi: 'लेजर और फ़िल्टर',
        subEn: 'Ledger & filters',
      },
      {
        k: 'growth credit',
        to: '/growth',
        hi: 'विकास',
        en: 'Growth',
        subHi: 'क्रेडिट स्कोर और रेफ़रल',
        subEn: 'Credit score & referrals',
      },
      {
        k: 'risk',
        to: '/risk',
        hi: 'जोखिम',
        en: 'Risk',
        subHi: 'सिमुलेशन और रनवे',
        subEn: 'Simulation & runway',
      },
      {
        k: 'document upload',
        to: '/documents',
        hi: 'दस्तावेज़',
        en: 'Documents',
        subHi: 'स्मार्ट अपलोड',
        subEn: 'Smart upload',
      },
    ]
    if (!s) return routes.slice(0, 6)
    return routes
      .filter(
        (r) =>
          r.k.includes(s) ||
          r.hi.toLowerCase().includes(s) ||
          r.en.toLowerCase().includes(s) ||
          r.subHi.toLowerCase().includes(s) ||
          r.subEn.toLowerCase().includes(s)
      )
      .slice(0, 6)
  }, [q, gst])

  async function wa(row) {
    const waTab = openUserGestureBlankTab()
    try {
      const res = await postExecuteCollect({
        customer: row.name,
        phone: phone10,
        amount: row.amount,
        tone: 'friendly',
      })
      const msg = buildWhatsappCollectionMessage(
        row.name,
        row.amount,
        'friendly',
        res?.payment_link || undefined
      )
      navigateTabOrOpenWhatsApp(waTab, phone10, msg)
      setToast({
        text: t('वॉट्सऐप + Razorpay लिंक भेजा', 'WhatsApp + Razorpay link sent'),
        link: res?.payment_link || undefined,
      })
    } catch {
      let payUrl = null
      try {
        const pay = await postPaymentLink({
          amount: row.amount,
          customer_name: row.name,
          phone: phone10,
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
      setToast({ text: t('ड्राफ़्ट खोला', 'Draft opened'), link: payUrl || undefined })
    }
    setTimeout(() => setToast(null), 8000)
  }

  async function call(row) {
    openTelDialer(phone10)
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      setToast({ text: res.mock ? t('डायलर', 'Dialer') : t('कॉल कतार में', 'Call queued') })
    } catch (e) {
      setToast({ text: getApiErrorMessage(e) })
    }
    setTimeout(() => setToast(null), 3000)
  }

  async function payLink(row) {
    try {
      const res = await postPaymentLink({ amount: row.amount, customer_name: row.name, phone: phone10 })
      const url = res?.payment_link
      if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
      setToast({
        text: url
          ? t('पेमेंट लिंक कॉपी हो गया।', 'Payment link copied to clipboard.')
          : t('ठीक', 'OK'),
        link: url || undefined,
      })
    } catch (e) {
      setToast({ text: getApiErrorMessage(e) })
    }
    setTimeout(() => setToast(null), 8000)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('कमांड पैलेट', 'Command palette')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-violet-200/80 bg-white shadow-2xl shadow-violet-500/20">
        <div className="flex flex-wrap items-center gap-2 border-b border-violet-100 px-3 py-2.5 sm:flex-nowrap sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-5 w-5 shrink-0 text-violet-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('रमेश, GST, या पेज…', 'Search name, GST, or page…')}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-violet-950 outline-none placeholder:text-violet-400"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Link
              to="/export"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#6C3BFF] bg-[#6C3BFF] px-3 py-2 text-xs font-bold text-white shadow-md shadow-[#6C3BFF]/25 transition hover:bg-[#5a32d6] hover:shadow-lg"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>{t('डेटा निर्यात', 'Export')}</span>
            </Link>
            <kbd className="hidden rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 sm:inline">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {filteredCustomers.length > 0 && (
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-violet-400">
              {t('ग्राहक', 'Customers')}
            </p>
          )}
          {filteredCustomers.map((row) => (
            <div
              key={`${row.name}-${row.amount}`}
              className="mb-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-violet-950">{row.name}</p>
                  <p className="text-sm text-violet-700">
                    {formatInr(row.amount)} {t('बकाया', 'due')}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-violet-300" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void wa(row)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t('वॉट्सऐप', 'WhatsApp')}
                </button>
                <button
                  type="button"
                  onClick={() => void call(row)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t('कॉल', 'Call')}
                </button>
                <button
                  type="button"
                  onClick={() => void payLink(row)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {t('पेमेंट लिंक', 'Payment link')}
                </button>
              </div>
            </div>
          ))}

          <p className="mb-1 mt-2 px-2 text-[10px] font-bold uppercase tracking-wider text-violet-400">
            {t('जाओ', 'Jump')}
          </p>
          {navHits.map((r) => (
            <button
              key={r.to}
              type="button"
              onClick={() => {
                navigate(r.to)
                setOpen(false)
              }}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-violet-50"
            >
              {r.to === '/gst' ? (
                <FileText className="h-5 w-5 text-emerald-600" />
              ) : r.to === '/export' ? (
                <Download className="h-5 w-5 text-[#6C3BFF]" />
              ) : (
                <PlusCircle className="h-5 w-5 text-violet-400" />
              )}
              <span>
                <span className="font-semibold text-violet-950">{t(r.hi, r.en)}</span>
                <span className="mt-0.5 block text-xs text-violet-600">{t(r.subHi, r.subEn)}</span>
              </span>
            </button>
          ))}
        </div>

        {toast && (
          <div className="border-t border-violet-100 px-4 py-2 text-center text-xs text-violet-800">
            <p>{typeof toast === 'string' ? toast : toast.text}</p>
            {typeof toast === 'object' && toast.link && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <a
                  href={toast.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 underline"
                >
                  {t('लिंक', 'Link')}
                </a>
                <button
                  type="button"
                  className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900"
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

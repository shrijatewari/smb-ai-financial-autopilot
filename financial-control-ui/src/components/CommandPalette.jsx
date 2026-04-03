import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, PlusCircle, FileText, MessageCircle, Phone, Link2 } from 'lucide-react'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'
import { formatInr, normalizePhone10, openWhatsAppDraft, buildWhatsappCollectionMessage, openTelDialer, buildHindiPaymentScript } from '../lib/collections'
import { getApiErrorMessage, postPaymentLink, postTwilioVoiceCall, postWhatsappReminder } from '../services/api'
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
      { k: 'people log dues', to: '/people', label: 'Log / Dues', sub: 'Full collection queue' },
      {
        k: 'gst tax',
        to: '/gst',
        label: 'GST summary',
        sub:
          gst?.next_due_date && gst?.estimated_liability_inr != null
            ? `Next due · est. ${formatInr(gst.estimated_liability_inr)}`
            : 'Compliance & filing',
      },
      { k: 'transaction len den', to: '/transactions', label: 'Transactions', sub: 'Ledger & filters' },
      { k: 'growth credit', to: '/growth', label: 'Growth', sub: 'Credit score & referrals' },
      { k: 'risk', to: '/risk', label: 'Risk', sub: 'Simulation & runway' },
      { k: 'document upload', to: '/documents', label: 'Documents', sub: 'Smart upload' },
    ]
    if (!s) return routes.slice(0, 4)
    return routes.filter((r) => r.k.includes(s) || r.label.toLowerCase().includes(s)).slice(0, 6)
  }, [q, gst])

  async function wa(row) {
    try {
      await postWhatsappReminder({ customer: row.name, phone: phone10, amount: row.amount, tone: 'friendly' })
      setToast('WhatsApp queued')
    } catch {
      openWhatsAppDraft(phone10, buildWhatsappCollectionMessage(row.name, row.amount, 'friendly'))
      setToast('Draft opened')
    }
    setTimeout(() => setToast(null), 3000)
  }

  async function call(row) {
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) openTelDialer(phone10)
      setToast(res.mock ? 'Dialer' : 'Call queued')
    } catch (e) {
      openTelDialer(phone10)
      setToast(getApiErrorMessage(e))
    }
    setTimeout(() => setToast(null), 3000)
  }

  async function payLink(row) {
    try {
      const res = await postPaymentLink({ amount: row.amount, customer_name: row.name, phone: phone10 })
      setToast(res?.payment_link ? 'Link created' : 'OK')
      if (res?.payment_link) window.open(res.payment_link, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setToast(getApiErrorMessage(e))
    }
    setTimeout(() => setToast(null), 4000)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('Command palette', 'Command palette')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-violet-200/80 bg-white shadow-2xl shadow-violet-500/20">
        <div className="flex items-center gap-2 border-b border-violet-100 px-3 py-2">
          <Search className="h-5 w-5 shrink-0 text-violet-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Ramesh, GST, ya page…', 'Search name, GST, or page…')}
            className="h-11 flex-1 border-0 bg-transparent text-sm text-violet-950 outline-none placeholder:text-violet-400"
          />
          <kbd className="hidden rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600 sm:inline">⌘K</kbd>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {filteredCustomers.length > 0 && (
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-violet-400">
              {t('Customers', 'Customers')}
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
                  <p className="text-sm text-violet-700">{formatInr(row.amount)} due</p>
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
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => void call(row)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </button>
                <button
                  type="button"
                  onClick={() => void payLink(row)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Payment link
                </button>
              </div>
            </div>
          ))}

          <p className="mb-1 mt-2 px-2 text-[10px] font-bold uppercase tracking-wider text-violet-400">
            {t('Jump', 'Jump')}
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
              ) : (
                <PlusCircle className="h-5 w-5 text-violet-400" />
              )}
              <span>
                <span className="font-semibold text-violet-950">{r.label}</span>
                <span className="mt-0.5 block text-xs text-violet-600">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {toast && <p className="border-t border-violet-100 px-4 py-2 text-center text-xs text-violet-800">{toast}</p>}
      </div>
    </div>
  )
}

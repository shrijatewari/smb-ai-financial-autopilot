import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { fetchNotifications } from '../services/api'
import { useTr } from '../hooks/useTr'
import { cn } from '../lib/utils'
import { useUiStore } from '../store/uiStore'

function formatWhen(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
  } catch {
    return ''
  }
}

export function NotificationsMenu() {
  const t = useTr()
  const bellPaymentHighlight = useUiStore((s) => s.bellPaymentHighlight)
  const dismissBellPaymentHighlight = useUiStore((s) => s.dismissBellPaymentHighlight)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState({ items: [], count: 0 })
  const wrapRef = useRef(null)

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    dismissBellPaymentHighlight()
    setOpen(true)
    setLoading(true)
    fetchNotifications({ limit: 12 })
      .then((data) => setPayload({ items: data.items || [], count: data.count ?? 0 }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = payload.items || []
  const hasUnread = items.length > 0

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/60 bg-white/70 text-violet-800 transition hover:border-[#6C3BFF]/40 hover:shadow-md',
          open && 'border-[#6C3BFF]/50 ring-2 ring-[#6C3BFF]/20',
          bellPaymentHighlight &&
            !open &&
            'border-amber-400/90 bg-amber-50/90 text-amber-950 shadow-[0_0_22px_rgba(251,191,36,0.55)] ring-2 ring-amber-400/70 animate-pulse'
        )}
        aria-label={t('सूचनाएँ', 'Notifications')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-violet-200/80 bg-white/95 p-0 shadow-xl backdrop-blur-xl"
          role="dialog"
          aria-label={t('सूचना सूची', 'Notifications list')}
        >
          <div className="border-b border-violet-100 px-4 py-3">
            <p className="text-sm font-semibold text-violet-950">
              {t('सूचनाएँ', 'Notifications')}
            </p>
            <p className="text-xs text-violet-600/80">
              {t('ब्रीफ़िंग और आउटबाउंड लॉग', 'Briefing & outbound log')}
            </p>
          </div>
          <div className="max-h-[min(60vh,320px)] overflow-y-auto px-2 py-2">
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-violet-500">
                {t('लोड हो रहा है…', 'Loading…')}
              </p>
            ) : items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-violet-600/80">
                {t('अभी कोई नई सूचना नहीं', 'No notifications yet')}
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((row) => (
                  <li
                    key={row.id || row.created_at}
                    className="rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-violet-100 hover:bg-violet-50/80"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-violet-500">
                      {(row.kind || 'notice').replace(/_/g, ' ')} · {row.channel || '–'}
                    </p>
                    <p className="line-clamp-2 text-sm text-violet-950/90">{row.detail || row.status || '–'}</p>
                    <p className="mt-0.5 text-[11px] text-violet-400">{formatWhen(row.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-violet-100 px-3 py-2">
            <Link
              to="/profile#profile-notifications"
              className="block rounded-lg px-2 py-2 text-center text-sm font-medium text-[#6C3BFF] hover:bg-violet-50"
              onClick={() => setOpen(false)}
            >
              {t('पूरा लॉग देखो', 'View full log')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

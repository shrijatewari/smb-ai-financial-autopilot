import { Link, NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  ArrowLeftRight,
  LineChart,
  Package,
  Sparkles,
  ShieldAlert,
  Receipt,
  Zap,
  UserCircle,
  FileStack,
  ClipboardList,
  MessageSquare,
  Sun,
  Users,
  Layers,
  TrendingUp,
  Download,
  ScanLine,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'
import { useNavBadges } from '../hooks/useNavBadges'

const nav = [
  { to: '/', hi: 'आज', en: 'Today', icon: Sun, end: true, basic: true },
  { to: '/people', hi: 'लोग / बकाया', en: 'People / dues', icon: Users, basic: true },
  { to: '/dashboard', hi: 'पूरा डैशबोर्ड', en: 'Full dashboard', icon: LayoutDashboard, basic: false },
  { to: '/transactions', hi: 'लेन-देन', en: 'Transactions', icon: ArrowLeftRight, basic: false },
  { to: '/cash-flow', hi: 'नकद बहाव', en: 'Cash flow', icon: LineChart, basic: false },
  { to: '/inventory', hi: 'स्टॉक / भंडार', en: 'Inventory', icon: Package, basic: false },
  { to: '/predictions', hi: 'अनुमान', en: 'Predictions', icon: Sparkles, basic: false },
  { to: '/risk', hi: 'जोखिम', en: 'Risk', icon: ShieldAlert, basic: false },
  { to: '/gst', hi: 'GST', en: 'GST', icon: Receipt, basic: false },
  { to: '/actions', hi: 'काम का केंद्र', en: 'Action center', icon: Zap, basic: false },
  { to: '/profile', hi: 'व्यवसाय प्रोफ़ाइल', en: 'Business profile', icon: UserCircle, basic: true },
  { to: '/export', hi: 'डेटा निर्यात', en: 'Export data', icon: Download, basic: true },
  { to: '/bills', hi: 'बिल', en: 'Bills', icon: ScanLine, basic: true },
  { to: '/documents', hi: 'दस्तावेज़', en: 'Documents', icon: FileStack, basic: false },
  { to: '/onboarding', hi: 'शुरुआत', en: 'Onboarding', icon: ClipboardList, basic: false },
  { to: '/assistant', hi: 'एआई से बात', en: 'AI chat', icon: MessageSquare, basic: true },
  { to: '/platform', hi: 'प्लेटफ़ॉर्म', en: 'Platform lab', icon: Layers, basic: false },
  { to: '/growth', hi: 'विकास', en: 'Growth', icon: TrendingUp, basic: false },
]

/** Localize badge chips from `useNavBadges` for current display language. */
function formatNavBadge(t, to, badge) {
  if (badge == null) return null
  const b = String(badge)
  if (to === '/people') {
    const n = parseInt(b.replace(/\D/g, ''), 10)
    if (!Number.isNaN(n)) return t(`${n} बकाया`, `${n} due`)
  }
  if (to === '/gst') {
    if (b === 'DUE') return t('देय', 'DUE')
    const m = b.match(/^(\d+)\s*din$/)
    if (m) return t(`${m[1]} दिन`, `${m[1]} d`)
  }
  if (to === '/') {
    if (b === 'URGENT') return t('ज़रूरी', 'URGENT')
    if (b === 'SOON') return t('जल्द', 'SOON')
    if (b === 'RISK') return t('जोखिम', 'RISK')
  }
  if (to === '/risk') {
    if (b === 'HIGH') return t('उच्च', 'HIGH')
    if (b === 'WATCH') return t('ध्यान', 'WATCH')
  }
  return b
}

export function Sidebar() {
  const t = useTr()
  const badges = useNavBadges()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const uiMode = useUiStore((s) => s.uiMode)
  const visible = uiMode === 'advanced' ? nav : nav.filter((item) => item.basic)

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      className="relative z-20 flex h-screen flex-col border-r border-white/30 bg-white/40 backdrop-blur-2xl"
    >
      <div className="flex h-16 items-center gap-2 border-b border-white/20 px-3 sm:px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-violet-500 text-lg font-bold text-white shadow-lg shadow-[#6C3BFF]/30">
          AI
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-violet-950">Business Twin</p>
            <p className="text-[10px] uppercase tracking-wider text-violet-600/80">
              {uiMode === 'basic' ? t('सादा मोड', 'Simple mode') : t('फ़ाइनेंशियल ओएस', 'Financial OS')}
            </p>
          </div>
        )}
        {!collapsed && (
          <Link
            to="/export"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-[#6C3BFF]/45 bg-white/90 px-2 py-1.5 text-[11px] font-bold text-[#5B2FE0] shadow-sm transition hover:bg-[#6C3BFF]/10"
            title={t('डेटा निर्यात', 'Export data')}
            aria-label={t('डेटा निर्यात', 'Export data')}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('निर्यात', 'Export')}</span>
          </Link>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map(({ to, hi, en, icon: Icon, end }) => {
          const badge = badges[to] ?? null
          const badgeText = formatNavBadge(t, to, badge)
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-[#6C3BFF]/15 to-violet-500/10 text-[#6C3BFF] shadow-[inset_0_0_0_1px_rgba(108,59,255,0.2)]'
                    : 'text-violet-950/70 hover:bg-white/60 hover:text-violet-950'
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
              {!collapsed && (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{t(hi, en)}</span>
                  {badgeText && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide normal-case',
                        to === '/' && badge === 'URGENT' && 'bg-red-600 text-white uppercase',
                        to === '/' && badge === 'SOON' && 'bg-amber-400/90 text-amber-950 uppercase',
                        to === '/' && badge === 'RISK' && 'bg-violet-600 text-white uppercase',
                        (to === '/people' || to === '/gst') && 'bg-amber-100 text-amber-950 normal-case',
                        to === '/risk' && badge === 'HIGH' && 'bg-red-600 text-white uppercase',
                        to === '/risk' && badge === 'WATCH' && 'bg-amber-200 text-amber-950 normal-case'
                      )}
                    >
                      {badgeText}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <button
        type="button"
        onClick={() => useUiStore.getState().toggleSidebar()}
        className="m-3 rounded-xl border border-violet-200/60 bg-white/50 py-2 text-xs text-violet-700 hover:bg-violet-50"
      >
        {collapsed ? '→' : t('← बंद करो', '← Collapse')}
      </button>
    </motion.aside>
  )
}

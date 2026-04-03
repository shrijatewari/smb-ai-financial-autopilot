import { NavLink } from 'react-router-dom'
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
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'

const nav = [
  { to: '/', hi: 'Aaj', en: 'Today', icon: Sun, end: true, basic: true },
  { to: '/people', hi: 'Log / Dues', en: 'People / dues', icon: Users, basic: true },
  { to: '/dashboard', hi: 'Poora dashboard', en: 'Full dashboard', icon: LayoutDashboard, basic: false },
  { to: '/transactions', hi: 'Len-den', en: 'Transactions', icon: ArrowLeftRight, basic: false },
  { to: '/cash-flow', hi: 'Cash flow', en: 'Cash flow', icon: LineChart, basic: false },
  { to: '/inventory', hi: 'Stock / inventory', en: 'Inventory', icon: Package, basic: false },
  { to: '/predictions', hi: 'Andaza', en: 'Predictions', icon: Sparkles, basic: false },
  { to: '/risk', hi: 'Risk', en: 'Risk', icon: ShieldAlert, basic: false },
  { to: '/gst', hi: 'GST', en: 'GST', icon: Receipt, basic: false },
  { to: '/actions', hi: 'Kaam ka centre', en: 'Action center', icon: Zap, basic: false },
  { to: '/profile', hi: 'Business profile', en: 'Business profile', icon: UserCircle, basic: true },
  { to: '/documents', hi: 'Documents', en: 'Documents', icon: FileStack, basic: false },
  { to: '/onboarding', hi: 'Shuruat', en: 'Onboarding', icon: ClipboardList, basic: false },
  { to: '/assistant', hi: 'AI se baat', en: 'AI chat', icon: MessageSquare, basic: true },
]

export function Sidebar() {
  const t = useTr()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const uiMode = useUiStore((s) => s.uiMode)
  const visible = uiMode === 'advanced' ? nav : nav.filter((item) => item.basic)

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      className="relative z-20 flex h-screen flex-col border-r border-white/30 bg-white/40 backdrop-blur-2xl"
    >
      <div className="flex h-16 items-center gap-2 border-b border-white/20 px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-violet-500 text-lg font-bold text-white shadow-lg shadow-[#6C3BFF]/30">
          AI
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-violet-950">Business Twin</p>
            <p className="text-[10px] uppercase tracking-wider text-violet-600/80">
              {uiMode === 'basic' ? t('Sada mode', 'Simple mode') : t('Financial OS', 'Financial OS')}
            </p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map(({ to, hi, en, icon: Icon, end }) => (
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
            {!collapsed && <span>{t(hi, en)}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => useUiStore.getState().toggleSidebar()}
        className="m-3 rounded-xl border border-violet-200/60 bg-white/50 py-2 text-xs text-violet-700 hover:bg-violet-50"
      >
        {collapsed ? '→' : t('← Band karo', '← Collapse')}
      </button>
    </motion.aside>
  )
}

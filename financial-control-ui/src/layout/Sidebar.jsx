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

const nav = [
  { to: '/', label: 'Aaj (Today)', icon: Sun, end: true },
  { to: '/people', label: 'Log / Dues', icon: Users },
  { to: '/dashboard', label: 'Full dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/cash-flow', label: 'Cash flow', icon: LineChart },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/predictions', label: 'Predictions', icon: Sparkles },
  { to: '/risk', label: 'Risk', icon: ShieldAlert },
  { to: '/gst', label: 'GST', icon: Receipt },
  { to: '/actions', label: 'Action center', icon: Zap },
  { to: '/profile', label: 'Business profile', icon: UserCircle },
  { to: '/documents', label: 'Documents', icon: FileStack },
  { to: '/onboarding', label: 'Onboarding', icon: ClipboardList },
  { to: '/assistant', label: 'AI chat', icon: MessageSquare },
]

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

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
            <p className="text-[10px] uppercase tracking-wider text-violet-600/80">Financial OS</p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
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
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => useUiStore.getState().toggleSidebar()}
        className="m-3 rounded-xl border border-violet-200/60 bg-white/50 py-2 text-xs text-violet-700 hover:bg-violet-50"
      >
        {collapsed ? '→' : '← Collapse'}
      </button>
    </motion.aside>
  )
}

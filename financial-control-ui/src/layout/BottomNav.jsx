import { NavLink } from 'react-router-dom'
import { Home, Users, Mic, Settings } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTr } from '../hooks/useTr'

const items = [
  { to: '/', hi: 'आज', en: 'Home', icon: Home, end: true },
  { to: '/people', hi: 'लोग', en: 'People', icon: Users },
  { to: '/assistant', hi: 'बोलो', en: 'Voice', icon: Mic },
  { to: '/profile', hi: 'सेटिंग', en: 'Settings', icon: Settings },
]

export function BottomNav() {
  const t = useTr()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-violet-200/60 bg-white/90 backdrop-blur-xl md:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0)] pt-1">
        {items.map(({ to, hi, en, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition',
                isActive ? 'text-[#6C3BFF]' : 'text-violet-950/55'
              )
            }
          >
            <Icon className="h-6 w-6 shrink-0" strokeWidth={2} />
            <span className="truncate leading-tight">{t(hi, en)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

import { Search, Bell, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-white/25 bg-white/35 px-4 backdrop-blur-xl md:px-8">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
        <input
          type="search"
          placeholder="Search insights, actions, customers…"
          className="h-10 w-full rounded-full border border-violet-200/50 bg-white/70 pl-10 pr-4 text-sm text-violet-950 placeholder:text-violet-400/80 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
          aria-label="Search"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/60 bg-white/70 text-violet-800 transition hover:border-[#6C3BFF]/40 hover:shadow-md"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
        </button>
        <div className="hidden flex-col items-end text-right sm:flex">
          <span className="max-w-[140px] truncate text-sm font-medium text-violet-950">{user?.name || 'Founder'}</span>
          <span className="max-w-[180px] truncate text-xs text-violet-600/80">{user?.email}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full border border-violet-200/50"
          onClick={() => {
            logout()
            navigate('/login')
          }}
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}

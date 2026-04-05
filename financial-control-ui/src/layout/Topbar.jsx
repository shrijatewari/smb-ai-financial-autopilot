import { Search, LogOut, Layers, Volume2, VolumeX, Languages } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { Button } from '../components/ui/button'
import { useUiStore } from '../store/uiStore'
import { cn } from '../lib/utils'
import { useTr } from '../hooks/useTr'
import { NotificationsMenu } from '../components/NotificationsMenu'

export function Topbar() {
  const { user, logout } = useAuth()
  const { streamStatus } = useSystemSnapshot()
  const navigate = useNavigate()
  const t = useTr()
  const uiMode = useUiStore((s) => s.uiMode)
  const setUiMode = useUiStore((s) => s.setUiMode)
  const localeDisplay = useUiStore((s) => s.localeDisplay)
  const setLocaleDisplay = useUiStore((s) => s.setLocaleDisplay)
  const voiceGuidanceEnabled = useUiStore((s) => s.voiceGuidanceEnabled)
  const setVoiceGuidanceEnabled = useUiStore((s) => s.setVoiceGuidanceEnabled)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-white/25 bg-white/35 px-4 backdrop-blur-xl md:px-8">
      <div className="relative max-w-md flex-1">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className={cn(
            'relative flex h-10 w-full items-center gap-2 rounded-full border border-violet-200/50 bg-white/70 pl-10 pr-3 text-left text-sm text-violet-500 transition hover:border-[#6C3BFF]/40 hover:bg-white/90'
          )}
          aria-label={t('Command palette (⌘K)', 'Command palette (⌘K)')}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
          <span className="flex-1 truncate">
            {t('Ramesh, GST, nayi transaction…', 'Search customers, GST, add txn…')}
          </span>
          <kbd className="hidden shrink-0 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full border border-emerald-200/50 bg-white/50 px-2 py-1 text-[10px] font-medium text-emerald-900/90 sm:text-xs"
          title={
            streamStatus === 'reconnecting'
              ? t('Live feed dobara jod rahe hain…', 'Reconnecting to live feed…')
              : streamStatus === 'live'
                ? t('Live — system state push', 'Live — system state push')
                : t('State load ho raha hai…', 'Loading system state…')
          }
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              streamStatus === 'live' ? 'bg-emerald-500' : 'bg-amber-500',
              streamStatus === 'reconnecting' && 'animate-pulse'
            )}
            aria-hidden
          />
          <span className="hidden sm:inline">
            {streamStatus === 'reconnecting'
              ? t('Dobara jod rahe…', 'Reconnecting…')
              : streamStatus === 'live'
                ? t('Live', 'Live')
                : t('Jod rahe…', 'Connecting…')}
          </span>
        </div>
        <div
          className="flex items-center rounded-full border border-violet-200/70 bg-white/60 p-0.5 text-[10px] font-semibold sm:text-xs"
          role="group"
          aria-label={t('Zubaan', 'Display language')}
        >
          <span className="hidden px-1.5 text-violet-500 sm:inline">
            <Languages className="inline h-3.5 w-3.5 align-middle" />
          </span>
          <button
            type="button"
            onClick={() => setLocaleDisplay('hi')}
            className={cn(
              'rounded-full px-2 py-1.5 transition sm:px-3',
              localeDisplay === 'hi' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('Sirf Hindi', 'Hindi only')}
          >
            हि
          </button>
          <button
            type="button"
            onClick={() => setLocaleDisplay('en')}
            className={cn(
              'rounded-full px-2 py-1.5 transition sm:px-3',
              localeDisplay === 'en' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('Sirf English', 'English only')}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocaleDisplay('both')}
            className={cn(
              'rounded-full px-2 py-1.5 transition sm:px-3',
              localeDisplay === 'both' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('Hindi + English', 'Hindi + English')}
          >
            HI+EN
          </button>
        </div>
        <div
          className="flex items-center rounded-full border border-violet-200/70 bg-white/60 p-0.5 text-xs font-semibold"
          role="group"
          aria-label={t('Layout', 'Basic or Advanced layout')}
        >
          <button
            type="button"
            onClick={() => setUiMode('basic')}
            className={cn(
              'rounded-full px-3 py-1.5 transition',
              uiMode === 'basic' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
          >
            {t('Basic', 'Basic')}
          </button>
          <button
            type="button"
            onClick={() => setUiMode('advanced')}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 transition',
              uiMode === 'advanced' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            {t('Advanced', 'Advanced')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setVoiceGuidanceEnabled(!voiceGuidanceEnabled)}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full border bg-white/70 transition hover:shadow-md',
            voiceGuidanceEnabled
              ? 'border-emerald-300/80 text-emerald-700'
              : 'border-violet-200/60 text-violet-500'
          )}
          title={voiceGuidanceEnabled ? t('Awaz band', 'Mute voice') : t('Awaz on', 'Voice on')}
          aria-label={voiceGuidanceEnabled ? t('Awaz chalu', 'Voice guidance on') : t('Awaz band', 'Voice off')}
          aria-pressed={voiceGuidanceEnabled}
        >
          {voiceGuidanceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <NotificationsMenu />
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

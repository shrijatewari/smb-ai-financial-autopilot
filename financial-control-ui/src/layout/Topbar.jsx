import { Search, LogOut, Layers, Volume2, VolumeX, Languages, Download } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { Button } from '../components/ui/button'
import { useUiStore } from '../store/uiStore'
import { cn } from '../lib/utils'
import { useTr } from '../hooks/useTr'
import { cancelSpeech } from '../lib/voice'
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
    <header className="sticky top-0 z-10 flex h-16 min-h-16 flex-nowrap items-center justify-between gap-2 border-b border-white/25 bg-white/35 px-3 backdrop-blur-xl sm:gap-4 sm:px-4 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div className="relative flex min-h-10 min-w-0 max-w-md flex-1 items-stretch overflow-hidden rounded-full border border-violet-200/50 bg-white/70 shadow-sm ring-1 ring-[#6C3BFF]/8 transition hover:border-[#6C3BFF]/40 hover:bg-white/90">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="relative flex min-w-0 flex-1 items-center gap-2 py-2 pl-10 pr-2 text-left text-sm text-violet-500"
            aria-label={t('कमांड पैलेट (⌘K)', 'Command palette (⌘K)')}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
            <span className="min-w-0 flex-1 truncate">
              {t('रमेश, GST, नई लेन-देन…', 'Search customers, GST, add txn…')}
            </span>
          </button>
          <div className="hidden h-6 w-px shrink-0 self-center bg-violet-200/90 sm:block" aria-hidden />
          <Link
            to="/export"
            onClick={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center gap-1 px-2.5 text-xs font-bold text-[#5B2FE0] transition hover:bg-[#6C3BFF]/12 sm:px-3 sm:text-sm"
            title={t('डेटा निर्यात', 'Export data')}
            aria-label={t('डेटा निर्यात – CSV और बैकअप', 'Export data – CSV & backup')}
          >
            <Download className="h-4 w-4 shrink-0 text-[#6C3BFF] sm:h-[18px] sm:w-[18px]" />
            <span className="hidden whitespace-nowrap sm:inline">{t('निर्यात', 'Export')}</span>
          </Link>
          <div className="flex shrink-0 items-center pr-2 sm:pr-3">
            <kbd className="hidden rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 sm:inline">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full border border-emerald-200/50 bg-white/50 px-2 py-1 text-[10px] font-medium text-emerald-900/90 sm:text-xs"
          title={
            streamStatus === 'reconnecting'
              ? t('लाइव फ़ीड दोबारा जोड़ रहे हैं…', 'Reconnecting to live feed…')
              : streamStatus === 'live'
                ? t('लाइव – सिस्टम स्टेट पुश', 'Live – system state push')
                : t('स्थिति लोड हो रही है…', 'Loading system state…')
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
              ? t('दोबारा जोड़ रहे…', 'Reconnecting…')
              : streamStatus === 'live'
                ? t('लाइव', 'Live')
                : t('जोड़ रहे…', 'Connecting…')}
          </span>
        </div>
        <div
          className="flex items-center rounded-full border border-violet-200/70 bg-white/60 p-0.5 text-[10px] font-semibold sm:text-xs"
          role="group"
          aria-label={t('ज़बान', 'Display language')}
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
            title={t('सिर्फ़ हिंदी', 'Hindi only')}
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
            title={t('सिर्फ़ अंग्रेज़ी', 'English only')}
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
            title={t('हिंदी + अंग्रेज़ी', 'Hindi + English')}
          >
            HI+EN
          </button>
          <button
            type="button"
            onClick={() => setLocaleDisplay('ta')}
            className={cn(
              'rounded-full px-1.5 py-1.5 transition sm:px-2.5',
              localeDisplay === 'ta' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('தமிழ் மட்டும்', 'Tamil only')}
          >
            த
          </button>
          <button
            type="button"
            onClick={() => setLocaleDisplay('te')}
            className={cn(
              'rounded-full px-1.5 py-1.5 transition sm:px-2.5',
              localeDisplay === 'te' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('తెలుగు మాత్రమే', 'Telugu only')}
          >
            తె
          </button>
          <button
            type="button"
            onClick={() => setLocaleDisplay('bn')}
            className={cn(
              'rounded-full px-1.5 py-1.5 transition sm:px-2.5',
              localeDisplay === 'bn' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
            title={t('শুধু বাংলা', 'Bengali only')}
          >
            বা
          </button>
        </div>
        <div
          className="flex items-center rounded-full border border-violet-200/70 bg-white/60 p-0.5 text-xs font-semibold"
          role="group"
          aria-label={t('लेआउट', 'Basic or Advanced layout')}
        >
          <button
            type="button"
            onClick={() => setUiMode('basic')}
            className={cn(
              'rounded-full px-3 py-1.5 transition',
              uiMode === 'basic' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            )}
          >
            {t('बुनियादी', 'Basic')}
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
            {t('उन्नत', 'Advanced')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !voiceGuidanceEnabled
            setVoiceGuidanceEnabled(next)
            if (!next) cancelSpeech()
          }}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full border bg-white/70 transition hover:shadow-md',
            voiceGuidanceEnabled
              ? 'border-emerald-300/80 text-emerald-700'
              : 'border-violet-200/60 text-violet-500'
          )}
          title={voiceGuidanceEnabled ? t('आवाज़ बंद', 'Mute voice') : t('आवाज़ चालू', 'Voice on')}
          aria-label={voiceGuidanceEnabled ? t('मार्गदर्शन आवाज़ चालू', 'Voice guidance on') : t('आवाज़ बंद', 'Voice off')}
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
          aria-label={t('लॉग आउट', 'Log out')}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}

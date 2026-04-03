import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { SystemStreamProvider } from '../context/SystemStreamContext'
import { warmSpeechVoices } from '../lib/voice'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { FloatingAssistant } from './FloatingAssistant'
import { BottomNav } from './BottomNav'
import { CommandPalette } from '../components/CommandPalette'

export function AppShell() {
  useEffect(() => {
    warmSpeechVoices()
  }, [])

  return (
    <SystemStreamProvider>
    <CommandPalette />
    <div className="twin-app flex min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-[#6C3BFF]/15 blur-[100px]" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-violet-300/20 blur-[90px]" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[80px]" />
      </div>
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-8 lg:p-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <FloatingAssistant />
    </div>
    </SystemStreamProvider>
  )
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AppShell } from './AppShell'

export default function ProtectedLayout() {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-violet-50/80 to-violet-100/50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#6C3BFF]/30 border-t-[#6C3BFF]" />
          <p className="text-sm text-violet-950/60">Loading your twin…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  /* Mandatory flow: (1) upload documents (2) business profile – then home / contextual screen. */
  if (user && !user.documents_uploaded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  if (user && !user.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  /* Full-screen onboarding (documents → business) – no sidebar/top chrome. */
  if (location.pathname === '/onboarding') {
    return <Outlet />
  }

  return <AppShell />
}

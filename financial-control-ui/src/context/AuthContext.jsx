import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchMe, login as apiLogin, signup as apiSignup, TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

/** Treat onboarding as complete only when API explicitly says true (strict gate). */
function normalizeUser(raw) {
  if (!raw) return null
  return {
    ...raw,
    onboarding_completed: raw.onboarding_completed === true,
    documents_uploaded: raw.documents_uploaded === true,
    trusted_helper_phone: raw.trusted_helper_phone ?? null,
    helper_approval_required: raw.helper_approval_required === true,
    conversation_language: raw.conversation_language === 'en' ? 'en' : 'hi',
    whatsapp_number: raw.whatsapp_number ?? null,
    morning_briefing_enabled: raw.morning_briefing_enabled === true,
    subscription_tier: raw.subscription_tier || 'free',
    referral_code: raw.referral_code ?? null,
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY))

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (!t) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await fetchMe()
      setUser(normalizeUser(me))
    } catch {
      logout()
    } finally {
      setLoading(false)
    }
  }, [logout])

  useEffect(() => {
    if (token) {
      setLoading(true)
      loadMe()
    } else {
      setUser(null)
      setLoading(false)
    }
  }, [token, loadMe])

  const login = useCallback(async ({ email, password }) => {
    const { access_token } = await apiLogin({ email, password })
    localStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
    const me = await fetchMe()
    const u = normalizeUser(me)
    setUser(u)
    return u
  }, [])

  const signup = useCallback(async ({ name, email, password, referral_code }) => {
    const { access_token } = await apiSignup({ name, email, password, referral_code })
    localStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
    const me = await fetchMe()
    const u = normalizeUser(me)
    setUser(u)
    return u
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      signup,
      logout,
      loadMe,
      isAuthenticated: !!user,
    }),
    [token, user, loading, login, signup, logout, loadMe]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../services/api'
import { Button } from '../components/ui/button'

export default function Signup() {
  const { signup, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState(() => (params.get('ref') || '').trim().toUpperCase())
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-violet-50 to-violet-100/80">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#6C3BFF]/30 border-t-[#6C3BFF]" />
      </div>
    )
  }
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await signup({ name, email, password, referral_code: referralCode || undefined })
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white via-violet-50/90 to-violet-100/80 px-4">
      <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-[#6C3BFF]/20 blur-[100px]" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl border border-white/50 bg-white/80 p-8 shadow-[0_24px_80px_-24px_rgba(108,59,255,0.35)] backdrop-blur-xl"
      >
        <div className="mb-2 inline-flex rounded-xl bg-gradient-to-br from-[#6C3BFF] to-violet-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-[#6C3BFF]/25">
          AI Business Twin
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-violet-950">Create account</h1>
        <p className="mt-1 text-sm text-violet-950/55">Onboarding flow unchanged – unlock your adaptive dashboard</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-violet-800/80">Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 text-sm text-violet-950 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-violet-800/80">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 text-sm text-violet-950 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-violet-800/80">Referral code (optional)</span>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.trim().toUpperCase())}
              placeholder="AB12CD34"
              className="mt-1 w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 font-mono text-sm text-violet-950 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-violet-800/80">Password (min 8)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 text-sm text-violet-950 focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-violet-950/55">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[#6C3BFF] underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

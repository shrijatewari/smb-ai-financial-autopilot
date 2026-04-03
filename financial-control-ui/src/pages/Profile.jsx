import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, CreditCard, Database, Landmark, MessageCircle, Radio, Receipt, Sun } from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { useAuth } from '../context/AuthContext'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { cn } from '../lib/utils'
import {
  fetchDocumentProfile,
  fetchNotifications,
  getAaStatus,
  getApiErrorMessage,
  getOnboardingState,
  patchMe,
  postAaInitiate,
  postSmsCommand,
} from '../services/api'

export default function Profile() {
  const { user, loadMe } = useAuth()
  const { snapshot: snap, streamStatus } = useSystemSnapshot()
  const [searchParams, setSearchParams] = useSearchParams()
  const [ob, setOb] = useState(null)
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [helperPhone, setHelperPhone] = useState('')
  const [helperApproval, setHelperApproval] = useState(false)
  const [helperSaving, setHelperSaving] = useState(false)
  const [helperMsg, setHelperMsg] = useState(null)
  const [convLang, setConvLang] = useState('hi')
  const [convSaving, setConvSaving] = useState(false)
  const [convMsg, setConvMsg] = useState(null)
  const [waPhone, setWaPhone] = useState('')
  const [briefingOn, setBriefingOn] = useState(false)
  const [briefingSaving, setBriefingSaving] = useState(false)
  const [briefingMsg, setBriefingMsg] = useState(null)
  const [smsText, setSmsText] = useState('BAL')
  const [smsReply, setSmsReply] = useState(null)
  const [smsBusy, setSmsBusy] = useState(false)
  const [aaStatus, setAaStatus] = useState(null)
  const [aaBusy, setAaBusy] = useState(false)
  const [aaMsg, setAaMsg] = useState(null)
  const [notif, setNotif] = useState(null)
  const [notifLoading, setNotifLoading] = useState(true)

  useEffect(() => {
    let c = false
    Promise.all([
      getOnboardingState().catch(() => ({})),
      fetchDocumentProfile().catch(() => null),
    ]).then(([o, d]) => {
      if (!c) {
        setOb(o)
        setDoc(d)
      }
    }).finally(() => {
      if (!c) setLoading(false)
    })
    return () => {
      c = true
    }
  }, [])

  useEffect(() => {
    let c = false
    getAaStatus()
      .then((s) => {
        if (!c) setAaStatus(s)
      })
      .catch(() => {})
    return () => {
      c = true
    }
  }, [])

  useEffect(() => {
    let c = false
    fetchNotifications({ limit: 40 })
      .then((d) => {
        if (!c) setNotif(d)
      })
      .catch(() => {
        if (!c) setNotif({ items: [], count: 0 })
      })
      .finally(() => {
        if (!c) setNotifLoading(false)
      })
    return () => {
      c = true
    }
  }, [])

  useEffect(() => {
    const aa = searchParams.get('aa')
    if (!aa) return
    if (aa === 'ok') {
      setAaMsg({ type: 'ok', text: 'Bank linked — AA transactions synced to your ledger.' })
    } else if (aa === 'failed') {
      setAaMsg({ type: 'err', text: 'Consent was not completed. Try again.' })
    } else if (aa === 'fi_error') {
      setAaMsg({ type: 'err', text: 'Consent ok but financial data could not be fetched.' })
    } else if (aa === 'error') {
      setAaMsg({ type: 'err', text: 'Consent not found or invalid.' })
    }
    getAaStatus()
      .then(setAaStatus)
      .catch(() => {})
    const next = new URLSearchParams(searchParams)
    next.delete('aa')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (user?.trusted_helper_phone != null) setHelperPhone(user.trusted_helper_phone)
    setHelperApproval(!!user?.helper_approval_required)
    setConvLang(user?.conversation_language === 'en' ? 'en' : 'hi')
    setWaPhone(user?.whatsapp_number ?? '')
    setBriefingOn(!!user?.morning_briefing_enabled)
  }, [user])

  async function saveBriefing(e) {
    e.preventDefault()
    setBriefingSaving(true)
    setBriefingMsg(null)
    try {
      await patchMe({
        whatsapp_number: waPhone.trim() || null,
        morning_briefing_enabled: briefingOn,
      })
      await loadMe()
      setBriefingMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setBriefingMsg({ type: 'err', text: getApiErrorMessage(err) })
    } finally {
      setBriefingSaving(false)
    }
  }

  async function saveConversationLanguage(e) {
    e.preventDefault()
    setConvSaving(true)
    setConvMsg(null)
    try {
      await patchMe({ conversation_language: convLang })
      await loadMe()
      setConvMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setConvMsg({ type: 'err', text: getApiErrorMessage(err) })
    } finally {
      setConvSaving(false)
    }
  }

  async function saveHelper(e) {
    e.preventDefault()
    setHelperSaving(true)
    setHelperMsg(null)
    try {
      await patchMe({
        trusted_helper_phone: helperPhone || null,
        helper_approval_required: helperApproval,
      })
      await loadMe()
      setHelperMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setHelperMsg({ type: 'err', text: getApiErrorMessage(err) })
    } finally {
      setHelperSaving(false)
    }
  }

  async function linkBankAccount() {
    setAaBusy(true)
    setAaMsg(null)
    try {
      const data = await postAaInitiate({})
      if (data?.redirect_url) {
        window.open(data.redirect_url, '_blank', 'noopener,noreferrer')
        setAaMsg({
          type: 'ok',
          text: data.mock
            ? 'Mock flow: complete the redirect in the new tab to sync demo transactions.'
            : 'Complete consent in the new tab. You will return here when done.',
        })
        const s = await getAaStatus()
        setAaStatus(s)
      }
    } catch (err) {
      setAaMsg({ type: 'err', text: getApiErrorMessage(err) })
    } finally {
      setAaBusy(false)
    }
  }

  async function trySms() {
    setSmsBusy(true)
    setSmsReply(null)
    try {
      const data = await postSmsCommand(smsText)
      setSmsReply(data?.reply || JSON.stringify(data))
    } catch (err) {
      setSmsReply(getApiErrorMessage(err))
    } finally {
      setSmsBusy(false)
    }
  }

  const modules = snap?.modules || []
  const radar = modules.map((m) => ({
    axis: m.name,
    v: Math.round((m.priority || 0.5) * 100),
  }))
  const trust = snap?.reconstruction?.confidence ?? 0.72
  const formality = doc?.formality_score ?? 0.68

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Settings & profile"
        subtitle="All sixteen product improvements are summarized below, plus assistant language and trusted helper. Use the checklist to jump to each area."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2 scroll-mt-24 border border-violet-200/60 bg-white/90">
          <CardHeader>
            <CardTitle>Improvements 1–16 (shipped)</CardTitle>
            <p className="text-sm font-normal text-violet-950/70">
              End-to-end map of the backend + UI surface area for this workspace.
            </p>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-violet-950/90">
              <li>
                <span className="font-medium text-violet-950">Payments &amp; profile sync</span> — Razorpay webhook →
                ledger; conversation language via PATCH /auth/me (Assistant).
              </li>
              <li>
                <span className="font-medium text-violet-950">Live twin (SSE)</span> — GET /system/stream; top bar Live
                badge.
              </li>
              <li>
                <span className="font-medium text-violet-950">Morning WhatsApp briefing</span> — APScheduler + Meta
                WhatsApp when configured.
              </li>
              <li>
                <span className="font-medium text-violet-950">WhatsApp inbound</span> — Bot intents + rate limits;
                PUBLIC_APP_URL for unknown numbers.
              </li>
              <li>
                <span className="font-medium text-violet-950">Account Aggregator</span> — Setu-style consent, FI ingest,
                /aa/* routes.
              </li>
              <li>
                <span className="font-medium text-violet-950">Data plane</span> — persisted ledger{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code>; GST liability{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /gst/summary</code> + GSTIN on profile.
              </li>
              <li>
                <span className="font-medium text-violet-950">Notification history</span> —{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /notifications</code> (briefing send attempts,
                more kinds later). See table below.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger CSV export</span> —{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger/export</code> authenticated
                download (UTF-8, headers for Excel). Button on the Transactions page.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger date range</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">date_from</code> &amp;{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">date_to</code> (YYYY-MM-DD, UTC day bounds) on{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code> and export; date
                pickers on Transactions.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger summary</span> —{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger/summary</code> returns row
                count, total credit, total debit, and net for the same optional date range; summary card on the
                Transactions page.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger description search</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">q</code> (max 200 chars, case-insensitive substring
                on description) on <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code>
                , summary, and CSV export; search field on Transactions. Paytm/mock rows filtered in the browser when{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">q</code> is set.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger source filter + shareable URL</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">source</code> (exact match, case-insensitive) on
                ledger, summary, and export; source dropdown on Transactions. Filters sync to the query string (
                <code className="rounded bg-violet-100 px-1 text-xs">
                  ?date_from=&amp;date_to=&amp;q=&amp;source=&amp;category=&amp;txn_type=&amp;sort=
                </code>
                ) for bookmarking.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger pagination</span> —{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code> supports{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">offset</code> +{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">limit</code> (UI: 200 rows per page, Previous/Next on
                Transactions). Summary + CSV export remain full filtered sets.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger credit/debit filter + URL</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">txn_type</code> (<code className="rounded bg-violet-100 px-1 text-xs">credit</code> or{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">debit</code>) on ledger, summary, and export; Type
                dropdown on Transactions. Shareable URL includes{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">txn_type=</code> alongside existing query params.
                Paytm/mock rows filtered in the browser by type when set.
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger sort order</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">sort</code> on{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code> and CSV export:{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">date_desc</code> (default),{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">date_asc</code>,{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">amount_desc</code>,{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">amount_asc</code>. Sort dropdown on Transactions;
                bookmarkable <code className="rounded bg-violet-100 px-1 text-xs">sort=</code> in the query string. Summary
                aggregates are unchanged (order-independent).
              </li>
              <li>
                <span className="font-medium text-violet-950">Ledger category filter</span> — optional{' '}
                <code className="rounded bg-violet-100 px-1 text-xs">category</code> (exact match, case-insensitive, max 32
                chars) on <code className="rounded bg-violet-100 px-1 text-xs">GET /transactions/ledger</code>, summary,
                and CSV export; category dropdown on Transactions; <code className="rounded bg-violet-100 px-1">category</code>{' '}
                column in the table. Paytm/mock rows filtered in the browser when set.
              </li>
            </ol>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24 border-violet-200/80 bg-gradient-to-br from-white to-violet-50/40">
          <CardHeader>
            <CardTitle>Features on your account</CardTitle>
            <p className="text-sm font-normal text-violet-950/70">
              Map of the integrations connected to this workspace (including persisted ledger + live feed).
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <Radio className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">Live twin feed (SSE)</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Status:{' '}
                    <span
                      className={cn(
                        'font-semibold',
                        streamStatus === 'live' ? 'text-emerald-700' : 'text-amber-700'
                      )}
                    >
                      {streamStatus === 'reconnecting' ? 'Reconnecting…' : streamStatus === 'live' ? 'Live' : 'Starting…'}
                    </span>{' '}
                    — see the badge in the top bar. Dashboard and Today use the same stream.
                  </p>
                  <Link className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#6C3BFF] hover:underline" to="/">
                    Open Today
                  </Link>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">Razorpay → ledger</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Payment links from the dashboard send customers to Razorpay; successful captures can post to your
                    ledger via the server webhook when <code className="rounded bg-violet-100 px-1">RAZORPAY_WEBHOOK_SECRET</code>{' '}
                    is set.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[#6C3BFF]">
                    <Link className="hover:underline" to="/dashboard">
                      Full dashboard
                    </Link>
                    <Link className="hover:underline" to="/transactions">
                      Transactions
                    </Link>
                  </div>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <Database className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">Persisted ledger (PostgreSQL)</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    The app loads real rows from <code className="rounded bg-violet-100 px-1">GET /transactions/ledger</code>{' '}
                    (optional <code className="rounded bg-violet-100 px-1">date_from</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">date_to</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">q</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">source</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">category</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">txn_type</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">sort</code> /{' '}
                    <code className="rounded bg-violet-100 px-1">offset</code> +{' '}
                    <code className="rounded bg-violet-100 px-1">limit</code>). Webhooks, Account Aggregator, and other
                    writers append to the same table.{' '}
                    <code className="rounded bg-violet-100 px-1">GET /transactions/ledger/summary</code> and{' '}
                    <code className="rounded bg-violet-100 px-1">GET /transactions/ledger/export</code> share the same
                    filters from the Transactions page (summary ignores <code className="rounded bg-violet-100 px-1">sort</code>{' '}
                    and pagination).
                  </p>
                  <Link className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" to="/transactions">
                    Open Transactions (table + CSV export)
                  </Link>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">GST liability forecasting</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Save <span className="font-mono">GSTIN</span> in onboarding (stored on BusinessProfile).{' '}
                    <code className="rounded bg-violet-100 px-1">GET /gst/summary</code> estimates the next GSTR-3B-style
                    outflow; the full dashboard run subtracts it in Monte Carlo on the due day when it falls in the
                    horizon.
                  </p>
                  <Link className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" to="/gst">
                    Open GST page
                  </Link>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <Sun className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">Morning WhatsApp briefing</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Scheduled 8:00 AM IST summary — enable below with your WhatsApp number.
                  </p>
                  <a className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" href="#profile-briefing">
                    Jump to briefing
                  </a>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-violet-950">WhatsApp inbound intents</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Customers can message your business WhatsApp number; the server routes intents like balance / risk /
                    pay (rate-limited). Unregistered numbers get a signup link when{' '}
                    <code className="rounded bg-violet-100 px-1">PUBLIC_APP_URL</code> is set.
                  </p>
                  <a className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" href="#profile-sms-demo">
                    SMS command demo
                  </a>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm sm:col-span-2">
                <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-violet-950">Account Aggregator (bank link)</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    RBI AA consent pulls bank transactions into the ledger (category <span className="font-mono">bank_aa</span>).
                  </p>
                  <a className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" href="#profile-aa">
                    Link bank account
                  </a>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-violet-100 bg-white/80 p-3 shadow-sm sm:col-span-2">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-violet-950">Notification &amp; briefing history</p>
                  <p className="mt-1 text-xs text-violet-950/70">
                    Server logs each outbound try (e.g. morning brief). Read-only audit from{' '}
                    <code className="rounded bg-violet-100 px-1">GET /notifications</code>.
                  </p>
                  <a className="mt-2 inline-block text-xs font-medium text-[#6C3BFF] hover:underline" href="#profile-notifications">
                    View history table
                  </a>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="conv-lang">
          <CardHeader>
            <CardTitle>Assistant / voice language</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-violet-950/70">
              Choose Hindi or English for AI assistant replies and voice explanations (separate from
              screen language in the top bar).
            </p>
            <form onSubmit={saveConversationLanguage} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-xs font-medium text-violet-950/70" htmlFor="conv-lang">
                  Conversation
                </label>
                <select
                  id="conv-lang"
                  value={convLang}
                  onChange={(e) => setConvLang(e.target.value)}
                  className="mt-1 block rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-violet-950"
                >
                  <option value="hi">हिंदी (Hindi)</option>
                  <option value="en">English</option>
                </select>
              </div>
              <Button type="submit" disabled={convSaving}>
                {convSaving ? 'Saving…' : 'Save'}
              </Button>
              {convMsg && (
                <p className={`text-sm ${convMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {convMsg.text}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="profile-briefing">
          <CardHeader>
            <CardTitle>Morning WhatsApp briefing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-violet-950/70">
              Daily 8:00 AM IST summary (cash, runway, top collection target). Needs your WhatsApp number and
              Meta WhatsApp API configured on the server.
            </p>
            <form onSubmit={saveBriefing} className="flex max-w-xl flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-violet-950/70" htmlFor="wa-phone">
                  WhatsApp number (10 digit)
                </label>
                <input
                  id="wa-phone"
                  type="tel"
                  inputMode="numeric"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-violet-950">
                <input
                  type="checkbox"
                  checked={briefingOn}
                  onChange={(e) => setBriefingOn(e.target.checked)}
                />
                Send morning briefing
              </label>
              <Button type="submit" disabled={briefingSaving}>
                {briefingSaving ? 'Saving…' : 'Save'}
              </Button>
              {briefingMsg && (
                <p className={`text-sm ${briefingMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {briefingMsg.text}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="profile-notifications">
          <CardHeader>
            <CardTitle>Briefing &amp; notification log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-violet-950/75">
              Rows come from <code className="rounded bg-violet-100 px-1">NotificationLog</code> on the server (e.g.
              daily WhatsApp brief attempts). Empty until the scheduler has run at least once.
            </p>
            {notifLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (notif?.items || []).length === 0 ? (
              <p className="text-sm text-violet-600">No entries yet — enable briefing and wait for the next 8:00 AM IST send.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-violet-100">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-violet-100 bg-violet-50/50 text-violet-700">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Kind</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(notif.items || []).map((row) => (
                      <tr key={row.id} className="border-b border-violet-50/80">
                        <td className="px-3 py-2 tabular-nums text-violet-800">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2 font-medium text-violet-950">{row.kind || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5',
                              row.status === 'sent' || row.status === 'mock'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            )}
                          >
                            {row.status}
                            {row.mock ? ' · demo' : ''}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-violet-700" title={row.detail || ''}>
                          {row.detail || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="profile-aa">
          <CardHeader>
            <CardTitle>Link bank account (Account Aggregator)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-violet-950/75">
              Connect via RBI Account Aggregator (e.g. Setu). Transactions appear in your ledger under{' '}
              <span className="font-medium">bank_aa</span>. Save your WhatsApp number above first, or the API will
              ask for a mobile on initiate.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-900">
                {aaStatus == null ? '…' : aaStatus.status || 'Not linked'}
              </span>
              {aaStatus?.has_linked_data && (
                <span className="text-xs text-emerald-700">Data on file</span>
              )}
              <Button type="button" variant="secondary" onClick={() => void linkBankAccount()} disabled={aaBusy}>
                {aaBusy ? 'Starting…' : 'Link bank account'}
              </Button>
            </div>
            {aaMsg && (
              <p className={`text-sm ${aaMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{aaMsg.text}</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trusted helper (beta)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveHelper} className="flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-medium text-violet-950/70" htmlFor="helper-phone">
                  Helper ka mobile (10 digit)
                </label>
                <input
                  id="helper-phone"
                  type="tel"
                  inputMode="numeric"
                  value={helperPhone}
                  onChange={(e) => setHelperPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-violet-950">
                <input
                  type="checkbox"
                  checked={helperApproval}
                  onChange={(e) => setHelperApproval(e.target.checked)}
                />
                Actions ke liye helper approval (demo — OTP jald)
              </label>
              <Button type="submit" disabled={helperSaving}>
                {helperSaving ? 'Saving…' : 'Save'}
              </Button>
            </form>
            {helperMsg && (
              <p className={`mt-3 text-sm ${helperMsg.type === 'err' ? 'text-red-700' : 'text-emerald-700'}`}>
                {helperMsg.text}
              </p>
            )}
            <p className="mt-2 text-xs text-violet-950/55">
              Low-literacy owners ke liye: beta, son/helper ko assign karo — future mein OTP se approve.
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="profile-sms-demo">
          <CardHeader>
            <CardTitle>SMS commands (demo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-violet-950/75">
              Same intent router powers{' '}
              <span className="font-medium">inbound WhatsApp</span> on your business number (server-side): balance, risk,
              pay flows share this logic. Gateway / Twilio can hit this endpoint. Test:{' '}
              <code className="rounded bg-violet-100 px-1">BAL</code>, <code className="rounded bg-violet-100 px-1">RISK</code>,{' '}
              <code className="rounded bg-violet-100 px-1">PAY</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                className="min-w-[120px] flex-1 rounded-xl border border-violet-200 px-3 py-2 text-sm"
                placeholder="BAL"
              />
              <Button type="button" variant="secondary" onClick={() => void trySms()} disabled={smsBusy}>
                {smsBusy ? '…' : 'Try'}
              </Button>
            </div>
            {smsReply != null && (
              <p className="rounded-lg border border-violet-200 bg-violet-50/80 p-3 text-sm text-violet-950">{smsReply}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-violet-950/70">Trust score</span>
                    <span className="font-medium text-violet-900">{(trust * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={trust * 100} />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-violet-950/70">Formality</span>
                    <span className="font-medium text-violet-900">{(formality * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={formality * 100} />
                </div>
                {ob && Object.keys(ob).length > 0 && (
                  <p className="text-xs text-violet-950/55">
                    Onboarding keys: {Object.keys(ob).slice(0, 6).join(', ')}
                    {Object.keys(ob).length > 6 ? '…' : ''}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Module radar</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : radar.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar}>
                  <PolarGrid stroke="rgba(108,59,255,0.2)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#5b4d7a', fontSize: 11 }} />
                  <Radar
                    name="Priority"
                    dataKey="v"
                    stroke="#6C3BFF"
                    fill="#6C3BFF"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-violet-950/55">Complete onboarding to unlock module vectors.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

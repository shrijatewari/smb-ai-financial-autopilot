import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Radio } from 'lucide-react'
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
import { useTr } from '../hooks/useTr'

export default function Profile() {
  const t = useTr()
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
      setAaMsg({ type: 'ok', text: 'Bank linked – AA transactions synced to your ledger.' })
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
      setBriefingMsg({ type: 'ok', text: t('सेव हो गया।', 'Saved.') })
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
      setHelperMsg({ type: 'ok', text: t('सेव हो गया।', 'Saved.') })
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
      const digits = (waPhone || '').replace(/\D/g, '')
      const body = digits.length >= 10 ? { mobile: digits.slice(-10) } : {}
      const data = await postAaInitiate(body)
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
        title={t('व्यवसाय प्रोफ़ाइल', 'Business profile')}
        subtitle={t(
          'भाषा, वॉट्सऐप, बैंक लिंक, और हेल्पर – वही लाइव ट्विन आज और पूरे डैशबोर्ड को चलाता है।',
          'Language, WhatsApp, bank link, and helpers – the same live twin powers Today and the full dashboard.'
        )}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2 scroll-mt-24 border border-violet-200/60 bg-gradient-to-br from-white to-violet-50/50">
          <CardHeader>
            <CardTitle>{t('त्वरित लिंक', 'Quick links')}</CardTitle>
            <p className="text-sm font-normal text-violet-950/70">
              {t(
                'रोज़ इस्तेमाल वाली स्क्रीन पर जाएँ। तकनीकी इंटीग्रेशन स्थिति प्लेटफ़ॉर्म लैब में है।',
                'Jump to the screens you use every day. Technical integration status lives under Platform lab.'
              )}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <li>
                <Link
                  className="block rounded-xl border border-violet-100 bg-white p-4 shadow-sm transition hover:border-[#6C3BFF]/40 hover:shadow-md"
                  to="/"
                >
                  <p className="font-semibold text-violet-950">{t('आज', 'Today')}</p>
                  <p className="mt-1 text-xs text-violet-600">
                    {t('रनवे, वसूली, कमांड पैलेट', 'Runway, collections, command palette')}
                  </p>
                </Link>
              </li>
              <li>
                <Link
                  className="block rounded-xl border border-violet-100 bg-white p-4 shadow-sm transition hover:border-[#6C3BFF]/40 hover:shadow-md"
                  to="/growth"
                >
                  <p className="font-semibold text-violet-950">{t('विकास', 'Growth')}</p>
                  <p className="mt-1 text-xs text-violet-600">{t('क्रेडिट स्कोर और रेफ़रल', 'Credit score & referrals')}</p>
                </Link>
              </li>
              <li>
                <Link
                  className="block rounded-xl border border-violet-100 bg-white p-4 shadow-sm transition hover:border-[#6C3BFF]/40 hover:shadow-md"
                  to="/transactions"
                >
                  <p className="font-semibold text-violet-950">{t('लेन-देन', 'Transactions')}</p>
                  <p className="mt-1 text-xs text-violet-600">{t('लेजर, फ़िल्टर, CSV', 'Ledger, filters, CSV')}</p>
                </Link>
              </li>
              <li>
                <Link
                  className="block rounded-xl border border-violet-100 bg-white p-4 shadow-sm transition hover:border-[#6C3BFF]/40 hover:shadow-md"
                  to="/platform"
                >
                  <p className="font-semibold text-violet-950">{t('प्लेटफ़ॉर्म लैब', 'Platform lab')}</p>
                  <p className="mt-1 text-xs text-violet-600">{t('लाइव बनाम डेमो इंटीग्रेशन', 'Live vs demo integrations')}</p>
                </Link>
              </li>
              <li>
                <Link
                  className="block rounded-xl border border-violet-100 bg-white p-4 shadow-sm transition hover:border-[#6C3BFF]/40 hover:shadow-md"
                  to="/export"
                >
                  <p className="font-semibold text-violet-950">{t('डेटा निर्यात', 'Export data')}</p>
                  <p className="mt-1 text-xs text-violet-600">{t('ऑफ़लाइन कतार, CSV', 'Offline queue, CSV')}</p>
                </Link>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
              <Radio className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <span>
                {t('लाइव ट्विन:', 'Live twin:')}{' '}
                <strong
                  className={cn(
                    streamStatus === 'live' ? 'text-emerald-700' : 'text-amber-700'
                  )}
                >
                  {streamStatus === 'reconnecting'
                    ? t('दोबारा जोड़ रहे…', 'Reconnecting…')
                    : streamStatus === 'live'
                      ? t('जुड़ा हुआ', 'Connected')
                      : t('शुरू हो रहा…', 'Starting…')}
                </strong>
                <span className="text-emerald-900/80">
                  {' '}
                  {t('– ऊपर बार में बैज जैसा।', '– matches the badge in the top bar.')}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="conv-lang">
          <CardHeader>
            <CardTitle>{t('सहायक / आवाज़ की भाषा', 'Assistant / voice language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-violet-950/70">
              {t(
                'एआई जवाब और आवाज़ समझ के लिए हिंदी या अंग्रेज़ी चुनें (ऊपर बार की स्क्रीन भाषा से अलग)।',
                'Choose Hindi or English for AI assistant replies and voice explanations (separate from screen language in the top bar).'
              )}
            </p>
            <form onSubmit={saveConversationLanguage} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-xs font-medium text-violet-950/70" htmlFor="conv-lang">
                  {t('बातचीत', 'Conversation')}
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
                {convSaving ? t('सेव हो रहा…', 'Saving…') : t('सेव', 'Save')}
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
            <CardTitle>{t('सुबह वॉट्सऐप ब्रीफ़िंग', 'Morning WhatsApp briefing')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-violet-950/70">
              {t(
                'रोज़ सुबह 8:00 IST सारांश (नकद, रनवे, शीर्ष वसूली लक्ष्य)। वॉट्सऐप नंबर और सर्वर पर Meta API चाहिए।',
                'Daily 8:00 AM IST summary (cash, runway, top collection target). Needs your WhatsApp number and Meta WhatsApp API configured on the server.'
              )}
            </p>
            <form onSubmit={saveBriefing} className="flex max-w-xl flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-violet-950/70" htmlFor="wa-phone">
                  {t('वॉट्सऐप नंबर (१० अंक)', 'WhatsApp number (10 digit)')}
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
                {t('सुबह ब्रीफ़िंग भेजो', 'Send morning briefing')}
              </label>
              <Button type="submit" disabled={briefingSaving}>
                {briefingSaving ? t('सेव हो रहा…', 'Saving…') : t('सेव', 'Save')}
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
            <CardTitle>{t('ब्रीफ़िंग और सूचना लॉग', 'Briefing & notification log')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-violet-950/75">
              Rows come from <code className="rounded bg-violet-100 px-1">NotificationLog</code> on the server (e.g.
              daily WhatsApp brief attempts). If the API cannot be reached, the app shows{' '}
              <strong>demo rows</strong> from <code className="rounded bg-violet-100 px-1">platformMocks.js</code> so the
              screen still works offline.
            </p>
            {notifLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                {notif?._mockFallback && (
                  <p className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
                    Showing <strong>demo notification log</strong> – connect the backend (or fix auth) to load real{' '}
                    <code className="rounded bg-amber-100 px-1">GET /notifications</code> rows.
                  </p>
                )}
                {(notif?.items || []).length === 0 ? (
                  !notif?._mockFallback && (
                    <p className="text-sm text-violet-600">
                      No entries yet – enable briefing and wait for the next 8:00 AM IST send.
                    </p>
                  )
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
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '–'}
                            </td>
                            <td className="px-3 py-2 font-medium text-violet-950">{row.kind || '–'}</td>
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
                              {row.detail || '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 scroll-mt-24" id="profile-aa">
          <CardHeader>
            <CardTitle>Link bank account (Account Aggregator)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-violet-950/75">
              <li>
                Enter a 10-digit India mobile in the{' '}
                <a href="#profile-briefing" className="font-medium text-[#6C3BFF] underline underline-offset-2">
                  Morning briefing
                </a>{' '}
                WhatsApp field (saved or just typed–we send it to AA).
              </li>
              <li>
                Tap <span className="font-medium">Link bank account</span> – Setu consent opens in a new tab. Complete
                approval there.
              </li>
              <li>
                Bank feeds sync into your ledger with source <span className="font-medium">bank_aa</span> (see
                Transactions).
              </li>
            </ol>
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
                Actions ke liye helper approval (demo – OTP jald)
              </label>
              <Button type="submit" disabled={helperSaving}>
                {helperSaving ? t('सेव हो रहा…', 'Saving…') : t('सेव', 'Save')}
              </Button>
            </form>
            {helperMsg && (
              <p className={`mt-3 text-sm ${helperMsg.type === 'err' ? 'text-red-700' : 'text-emerald-700'}`}>
                {helperMsg.text}
              </p>
            )}
            <p className="mt-2 text-xs text-violet-950/55">
              Low-literacy owners ke liye: beta, son/helper ko assign karo – future mein OTP se approve.
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

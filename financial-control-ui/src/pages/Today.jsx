import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic, Phone, Sparkles, Users, MessageCircle, Wallet, ListTodo, Play } from 'lucide-react'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  formatInr,
  normalizePhone10,
  openTelDialer,
  openWhatsAppDraft,
} from '../lib/collections'
import { executeAction, getApiErrorMessage, postPaymentLink, postTwilioVoiceCall, postWhatsappReminder } from '../services/api'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { VoiceConfirmModal } from '../components/VoiceConfirmModal'
import { GuidedHandOverlay } from '../components/GuidedHandOverlay'
import { ShowMeVideoModal } from '../components/ShowMeVideoModal'
import { HELP_VIDEOS } from '../constants/helpVideos'
import { speakHindi, cancelSpeech } from '../lib/voice'
import { useUiStore } from '../store/uiStore'
import { useAuth } from '../context/AuthContext'
import { useTr } from '../hooks/useTr'
import { Bilingual } from '../lib/i18n'
import { cn } from '../lib/utils'
import { TodayStatsBar } from '../components/TodayStatsBar'
import { CollectionQueueList } from '../components/CollectionQueueList'
import { CustomerCollectionTimeline } from '../components/CustomerCollectionTimeline'
import { attachMockPayScores } from '../lib/platformMocks'

const DEFAULT_PHONE = '9004930401'
const GUIDED_DONE_KEY = 'SMB_GUIDED_FIRST_DONE'

function headlineFromSnap(snap) {
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const risk = snap?.risk
  if (daysNeg != null && daysNeg <= 14) {
    return {
      hi: `⚠️ ${daysNeg} din mein paisa khatam ho sakta hai`,
      en: `⚠️ Cash may run out in ~${daysNeg} days`,
      urgent: true,
    }
  }
  if (risk != null && risk > 0.25) {
    const pct = (100 * risk).toFixed(0)
    return {
      hi: `⚠️ Cash risk zyada hai — lagbhag ${pct}% chance stress ke saath`,
      en: `⚠️ Cash risk is high — about ${pct}% chance of stress`,
      urgent: true,
    }
  }
  if (daysNeg != null) {
    return {
      hi: `Stress timing ~${daysNeg} din — collections follow karein`,
      en: `Stress timing ~${daysNeg} days — follow up collections`,
      urgent: false,
    }
  }
  return {
    hi: 'Aaj cash stable lag raha hai — phir bhi dues follow karein',
    en: 'Cash looks stable today — still follow up on dues',
    urgent: false,
  }
}

/** Layer 1 — Today status: contextual, no graph overload (uses backend dashboard_context when present). */
function layer1FromSnap(snap, ctx) {
  const dc = snap?.daily_control
  const daysNeg = dc?.days_to_negative
  const risk = snap?.risk
  const rl = ctx?.risk_level

  if (rl === 'high' || (daysNeg != null && daysNeg <= 7) || (risk != null && risk > 0.35)) {
    const d = daysNeg
    if (d != null) {
      return {
        hi: `⚠️ Urgent: ~${d} din mein cash khatam`,
        en: `⚠️ Urgent: cash may run out in ~${d} days`,
        urgent: true,
      }
    }
    return {
      hi: '⚠️ Urgent: cash risk bahut zyada — abhi collect karein',
      en: '⚠️ Urgent: very high cash risk — collect now',
      urgent: true,
    }
  }
  if (
    rl === 'low' &&
    (daysNeg == null || daysNeg > 14) &&
    (risk == null || risk < 0.18)
  ) {
    return {
      hi: '✅ Aaj sab safe hai — phir bhi dues follow karein',
      en: '✅ All safe today — still follow up on dues',
      urgent: false,
    }
  }
  return headlineFromSnap(snap)
}

export default function Today() {
  const { user } = useAuth()
  const { snapshot: snap, error: streamError, streamStatus } = useSystemSnapshot()
  const gstCtx = snap?.dashboard_context?.gst
  const t = useTr()
  const localeDisplay = useUiStore((s) => s.localeDisplay)
  const uiMode = useUiStore((s) => s.uiMode)
  const voiceOn = useUiStore((s) => s.voiceGuidanceEnabled)
  const guidedHandActive = useUiStore((s) => s.guidedHandActive)
  const guidedStep = useUiStore((s) => s.guidedStep)
  const setGuidedHand = useUiStore((s) => s.setGuidedHand)
  const advanceGuidedStep = useUiStore((s) => s.advanceGuidedStep)
  const dismissGuidedHand = useUiStore((s) => s.dismissGuidedHand)
  const setVoiceGuidanceEnabled = useUiStore((s) => s.setVoiceGuidanceEnabled)

  const error = streamError
  const [phone, setPhone] = useState(DEFAULT_PHONE)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [videoOpen, setVideoOpen] = useState(null)
  const [timelineRow, setTimelineRow] = useState(null)
  const actionRef = useRef(null)
  const headlineSpoken = useRef(false)
  const autoGuidedApplied = useRef(false)

  const loading = snap == null && !error
  const dc = snap?.daily_control
  const primary = snap?.action
  const queue = dc?.collection_queue ?? []
  const queueRows = useMemo(() => attachMockPayScores(queue), [queue])
  const meta = primary?.metadata || {}
  const collectAmount = Number(meta.suggested_amount ?? queue[0]?.amount ?? 2400)
  const collectName = String(meta.customer || queue[0]?.name || 'Customer')
  const act = primary?.action || 'collect_payment'
  const ctx = snap?.dashboard_context
  const line = useMemo(() => {
    if (!snap) return { hi: '', en: '', urgent: false }
    return layer1FromSnap(snap, ctx)
  }, [snap, ctx])
  const literacyMinimal = ctx?.literacy_ui === 'minimal'

  const phone10 = normalizePhone10(phone) || DEFAULT_PHONE

  const cashHint = useMemo(() => {
    const c = snap?.cash
    if (c != null && c !== '') return Number(c)
    const est = snap?.reconstruction?.estimated_cash
    if (est != null) return Number(est)
    const m = snap?.meta
    if (m?.expected_cash != null) return Number(m.expected_cash)
    return null
  }, [snap])

  /** High risk → voice + guided on once per "high" episode (poll-safe). */
  useEffect(() => {
    const on = snap?.dashboard_context?.flags?.auto_guided_voice
    if (!on) {
      autoGuidedApplied.current = false
      return
    }
    if (autoGuidedApplied.current) return
    autoGuidedApplied.current = true
    setVoiceGuidanceEnabled(true)
    setGuidedHand(true, 0)
  }, [snap?.dashboard_context?.flags?.auto_guided_voice, setVoiceGuidanceEnabled, setGuidedHand])

  /** First visit, or once per session when risk is high — guided hand (user can dismiss). */
  useEffect(() => {
    if (loading || !snap) return
    if (snap.dashboard_context?.flags?.auto_guided_voice) return
    const done = typeof localStorage !== 'undefined' && localStorage.getItem(GUIDED_DONE_KEY)
    if (!done) {
      setGuidedHand(true, 0)
      return
    }
    if (
      line.urgent &&
      typeof sessionStorage !== 'undefined' &&
      !sessionStorage.getItem('SMB_GUIDED_URGENT_SESSION')
    ) {
      sessionStorage.setItem('SMB_GUIDED_URGENT_SESSION', '1')
      setGuidedHand(true, 0)
    }
  }, [loading, snap, line.urgent, setGuidedHand])

  useEffect(() => {
    if (!loading && snap && voiceOn && line.hi && !headlineSpoken.current) {
      headlineSpoken.current = true
      speakHindi(line.hi)
    }
  }, [loading, snap, line.hi, voiceOn])

  function finishGuided() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(GUIDED_DONE_KEY, '1')
    dismissGuidedHand()
  }

  function receipt(msg) {
    if (voiceOn) speakHindi(msg)
  }

  function helperBlocks() {
    if (!user?.helper_approval_required) return false
    return true
  }

  async function runWhatsApp() {
    if (helperBlocks()) {
      const msg = t(
        'Helper approval abhi demo mein band hai. Profile se helper number save karein — OTP jald.',
        'Helper approval is off in this demo. Save a helper number in Profile — OTP soon.'
      )
      setToast({ type: 'warn', text: msg })
      receipt(msg)
      return
    }
    setBusy('wa')
    setToast(null)
    try {
      await postWhatsappReminder({
        customer: collectName,
        phone: phone10,
        amount: collectAmount,
        tone: 'friendly',
      })
      const ok = `${formatInr(collectAmount)} ka reminder ${collectName.split('(')[0].trim()} ko bhej diya gaya hai.`
      setToast({
        type: 'ok',
        text: t(
          'Reminder bheja gaya (WhatsApp / Meta API jab configured ho).',
          'Reminder sent (when WhatsApp / Meta API is configured).'
        ),
      })
      receipt(ok)
    } catch (e) {
      const msg = getApiErrorMessage(e)
      const draft = buildWhatsappCollectionMessage(collectName, collectAmount, 'friendly')
      openWhatsAppDraft(phone10, draft)
      setToast({
        type: 'warn',
        text: `${msg} — ${t('WhatsApp draft khola.', 'WhatsApp draft opened.')}`,
      })
      receipt('WhatsApp draft khul gaya — aap wahan se bhej sakte hain.')
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  async function runCall() {
    if (helperBlocks()) {
      const msg = t(
        'Helper approval demo: abhi seedha call karenge — OTP flow jald.',
        'Helper approval demo: calling directly for now — OTP flow soon.'
      )
      setToast({ type: 'warn', text: msg })
      receipt(msg)
      return
    }
    setBusy('call')
    setToast(null)
    const script = buildHindiPaymentScript(collectName, collectAmount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) {
        openTelDialer(phone10)
        setToast({
          type: 'warn',
          text:
            res.detail ||
            t(
              'Twilio set nahi hai — phone dialer khola. Script: ',
              'Twilio not set — phone dialer opened. Script: '
            ) +
              script.slice(0, 80) +
              '…',
        })
        receipt('Dialer khul gaya — aap call kar sakte hain.')
      } else {
        setToast({
          type: 'ok',
          text: `${t('Call queue:', 'Call queue:')} ${res.sid || 'ok'}`,
        })
        receipt('Call queue lag gayi.')
      }
    } catch (e) {
      openTelDialer(phone10)
      setToast({
        type: 'warn',
        text: `${getApiErrorMessage(e)} — ${t('dialer khola.', 'dialer opened.')}`,
      })
      receipt('Dialer khul gaya.')
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 12000)
    }
  }

  async function runSystemHandle() {
    if (helperBlocks()) {
      const msg = t(
        'Helper approval: payment link demo ke liye helper OTP baad mein.',
        'Helper approval: helper OTP for payment link demo later.'
      )
      setToast({ type: 'warn', text: msg })
      receipt(msg)
      return
    }
    setBusy('sys')
    setToast(null)
    try {
      const payRes = await postPaymentLink({
        amount: collectAmount,
        customer_name: collectName,
        phone: phone10,
      })
      const execPayload = { action: act, reference: `today-${Date.now()}` }
      if (act === 'collect_payment') {
        execPayload.amount = collectAmount
        execPayload.customer = collectName
      }
      await executeAction(execPayload)
      setToast({
        type: 'ok',
        text: t(
          'System ne payment link + action log kiya.',
          'System created payment link + logged action.'
        ),
        link: payRes.payment_link,
      })
      receipt('Payment link ban gaya aur system ne action log kar diya.')
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
      receipt(
        t('Kuch gadbad ho gayi — screen par message dekho.', 'Something went wrong — see message on screen.')
      )
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 14000)
    }
  }

  async function queueMessage(row) {
    if (helperBlocks()) {
      setToast({ type: 'warn', text: t('Helper approval demo…', 'Helper approval demo…') })
      return
    }
    setBusy('wa')
    setToast(null)
    try {
      await postWhatsappReminder({
        customer: row.name,
        phone: phone10,
        amount: Number(row.amount),
        tone: 'friendly',
      })
      setToast({
        type: 'ok',
        text: t('Reminder bheja gaya.', 'Reminder sent.'),
      })
    } catch (e) {
      openWhatsAppDraft(phone10, buildWhatsappCollectionMessage(row.name, row.amount, 'friendly'))
      setToast({ type: 'warn', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  async function queueCall(row) {
    if (helperBlocks()) {
      setToast({ type: 'warn', text: t('Helper approval demo…', 'Helper approval demo…') })
      return
    }
    setBusy('call')
    setToast(null)
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) openTelDialer(phone10)
      setToast({ type: res.mock ? 'warn' : 'ok', text: res.mock ? 'Dialer' : 'Call queued' })
    } catch (e) {
      openTelDialer(phone10)
      setToast({ type: 'warn', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  function openConfirm(kind) {
    const short = collectName.split('(')[0].trim()
    const amt = formatInr(collectAmount)
    const lines = {
      wa: {
        hi: `Aap ${short} ko ${amt} ka reminder bhejne wale hain. Boliye YES ya NO.`,
        en: `You are about to send a ${amt} reminder to ${short}. Say YES or NO.`,
      },
      call: {
        hi: `Aap ${short} ko call karne wale hain. Boliye YES ya NO.`,
        en: `You are about to call ${short}. Say YES or NO.`,
      },
      sys: {
        hi: 'Aap system se payment link banane wale hain. Boliye YES ya NO.',
        en: 'You are about to create a payment link from the system. Say YES or NO.',
      },
    }
    const { hi, en } = lines[kind]
    setConfirm({ kind, messageHi: hi, messageEn: en })
    if (voiceOn) speakHindi(hi)
  }

  function onWhatsApp() {
    setConfirm(null)
    cancelSpeech()
    void runWhatsApp()
  }
  function onCall() {
    setConfirm(null)
    cancelSpeech()
    void runCall()
  }
  function onSystemHandle() {
    setConfirm(null)
    cancelSpeech()
    void runSystemHandle()
  }

  const basic = uiMode === 'basic'

  return (
    <div
      className={cn(
        'min-h-[calc(100vh-4rem)] bg-gradient-to-b from-violet-50/40 to-white px-4 pb-28 pt-8 sm:px-6',
        ctx?.risk_level === 'high' && 'ring-2 ring-red-400/50 ring-inset sm:rounded-3xl'
      )}
    >
      <GuidedHandOverlay
        open={guidedHandActive}
        step={guidedStep}
        onNext={() => advanceGuidedStep()}
        onDismiss={finishGuided}
      />
      <VoiceConfirmModal
        open={!!confirm}
        title={t('पुष्टि करें', 'Confirm')}
        messageHi={confirm?.messageHi}
        messageEn={confirm?.messageEn}
        onConfirm={() => {
          const k = confirm?.kind
          setConfirm(null)
          if (k === 'wa') onWhatsApp()
          else if (k === 'call') onCall()
          else if (k === 'sys') onSystemHandle()
        }}
        onCancel={() => {
          cancelSpeech()
          setConfirm(null)
          if (voiceOn) speakHindi('Theek hai, kuch nahi kiya.')
        }}
      />
      <ShowMeVideoModal
        open={!!videoOpen}
        title={videoOpen?.title}
        embedUrl={videoOpen?.url}
        onClose={() => setVideoOpen(null)}
      />
      {timelineRow && (
        <CustomerCollectionTimeline
          row={timelineRow}
          busy={!!busy}
          onClose={() => setTimelineRow(null)}
          onWhatsApp={() => {
            void queueMessage(timelineRow)
            setTimelineRow(null)
          }}
          onPaymentLink={async () => {
            setBusy('sys')
            try {
              await postPaymentLink({
                amount: Number(timelineRow.amount),
                customer_name: timelineRow.name,
                phone: phone10,
              })
              setToast({ type: 'ok', text: t('Payment link banaya.', 'Payment link created.') })
            } catch (e) {
              setToast({ type: 'err', text: getApiErrorMessage(e) })
            } finally {
              setBusy(null)
              setTimelineRow(null)
              setTimeout(() => setToast(null), 8000)
            }
          }}
        />
      )}

      <div className="mx-auto max-w-2xl">
        <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
          <Bilingual
            mode={localeDisplay}
            hi="Aaj — status"
            en="Today — status"
            className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500"
            subClassName="text-[10px] normal-case tracking-normal text-violet-500/90"
          />
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-4 text-center text-2xl font-bold leading-snug sm:text-3xl ${
            line.urgent ? 'text-red-700' : 'text-violet-950'
          }`}
        >
          {loading ? (
            '…'
          ) : localeDisplay === 'en' ? (
            <span lang="en">{line.en}</span>
          ) : localeDisplay === 'hi' ? (
            line.hi
          ) : (
            <>
              <span className="block">{line.hi}</span>
              <span
                className="mt-2 block text-lg font-semibold leading-snug text-violet-800/90 sm:text-xl"
                lang="en"
              >
                {line.en}
              </span>
            </>
          )}
        </motion.h1>

        {!loading && (
          <div className="mt-3 flex justify-center">
            <Link
              to="/assistant?explain=risk"
              className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#6C3BFF] shadow-sm hover:bg-violet-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t('Yeh number samjhao', 'Explain this')}
            </Link>
          </div>
        )}

        {!loading && snap && (
          <div className="mt-6">
            <TodayStatsBar snap={snap} loading={loading} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-violet-600/90">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-white/90 px-3 py-1.5 shadow-sm"
            title={t('System stream', 'System stream')}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                streamStatus === 'live' ? 'bg-emerald-500' : 'bg-amber-500',
                streamStatus === 'reconnecting' && 'animate-pulse'
              )}
              aria-hidden
            />
            {streamStatus === 'reconnecting'
              ? t('Twin dobara jod rahe…', 'Reconnecting twin…')
              : streamStatus === 'live'
                ? t('Twin live (SSE)', 'Twin live (SSE)')
                : t('Twin start…', 'Twin starting…')}
          </span>
          <Link
            to="/profile"
            className="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 font-medium text-[#6C3BFF] shadow-sm hover:bg-violet-50"
          >
            {t('Briefing · Bank · WhatsApp', 'Briefing · bank · WhatsApp')}
          </Link>
          <Link
            to="/profile#profile-notifications"
            className="rounded-full border border-violet-200/50 bg-white/70 px-3 py-1.5 text-violet-800 hover:bg-violet-50"
          >
            {t('Briefing log', 'Briefing log')}
          </Link>
          <Link
            to="/transactions"
            className="rounded-full border border-violet-200/60 bg-white/60 px-3 py-1.5 text-violet-800 hover:bg-violet-50"
          >
            {t('Len-den', 'Transactions')}
          </Link>
        </div>

        {gstCtx?.show_warning && gstCtx.gst_registered && (
          <div className="mt-4 rounded-2xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 text-left shadow-sm">
            <p className="text-sm font-bold text-amber-950">
              {t('GST jaldi file karna — due paas hai', 'GST filing due within 2 weeks')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-950/90">
              {t(
                `Lagbhag ${formatInr(gstCtx.estimated_liability_inr)} — due ${gstCtx.next_due_date ?? '—'}`,
                `Estimated ${formatInr(gstCtx.estimated_liability_inr)} · due ${gstCtx.next_due_date ?? '—'}`,
              )}
            </p>
            {gstCtx.gstin && (
              <p className="mt-1 font-mono text-[11px] text-amber-900/80">GSTIN {gstCtx.gstin}</p>
            )}
            <Link
              to="/gst"
              className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2"
            >
              {t('GST detail dekho', 'Open GST page')}
            </Link>
          </div>
        )}

        {basic && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white py-5 shadow-md transition hover:border-[#6C3BFF]/40"
              onClick={() => {
                if (voiceOn)
                  speakHindi(
                    cashHint != null
                      ? `Aapke paas lagbhag ${formatInr(cashHint)} cash hai.`
                      : 'Cash abhi estimate nahi hai.'
                  )
              }}
            >
              <Wallet className="h-8 w-8 text-[#6C3BFF]" />
              <span className="text-center text-sm font-bold text-violet-950">
                {t('Paisa dekho', 'View cash')}
              </span>
              {cashHint != null && (
                <span className="text-xs font-bold text-emerald-700">{formatInr(cashHint)}</span>
              )}
            </button>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white py-5 shadow-md transition hover:border-[#6C3BFF]/40"
              onClick={() => actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <ListTodo className="h-8 w-8 text-[#6C3BFF]" />
              <span className="text-center text-sm font-bold text-violet-950">
                {t('Kya karna hai', 'What to do')}
              </span>
            </button>
            <Link
              to="/people"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50/80 py-5 shadow-md transition hover:border-emerald-400"
            >
              <Users className="h-8 w-8 text-emerald-700" />
              <span className="text-center text-sm font-bold text-emerald-900">
                {t('Logon se paise lo', 'Collect from people')}
              </span>
            </Link>
          </div>
        )}

        {ctx?.flags?.show_inventory_strip && ctx?.inventory_hint && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-center shadow-sm">
            <p className="text-sm font-bold text-amber-950">{ctx.inventory_hint.headline}</p>
            <p className="mt-1 text-xs text-amber-950/90">{ctx.inventory_hint.sub}</p>
            <Link
              to="/inventory"
              className="mt-3 inline-block rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md"
            >
              {ctx.inventory_hint.cta}
            </Link>
          </div>
        )}

        {ctx?.flags?.show_service_booking_hint && ctx?.service_hint && (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/95 px-4 py-3 text-center text-sky-950 shadow-sm">
            <p className="text-sm font-bold">{ctx.service_hint.headline}</p>
            <p className="mt-1 text-xs opacity-90">{ctx.service_hint.sub}</p>
          </div>
        )}

        <div
          className={cn(
            'mt-8 space-y-4',
            guidedHandActive && guidedStep === 0 && 'rounded-3xl ring-4 ring-[#6C3BFF]/60 ring-offset-2'
          )}
        >
          <label className="flex flex-col gap-1 text-xs text-violet-800/80">
            <span className="font-medium">
              {t('Default WhatsApp / call number (sab customers)', 'Default number for WhatsApp / calls')}
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-2.5 text-center font-mono tabular-nums text-violet-950"
              inputMode="numeric"
            />
          </label>

          {!loading && queueRows.length > 0 && (
            <CollectionQueueList
              rows={queueRows}
              title={t('Aaj collect karein', 'Collect today')}
              subtitle={t('Poori ranked list — row par tap karke timeline dekho', 'Full ranked list — tap a row for timeline')}
              totalDueLabel={t('Total', 'Total')}
              busyKey={() => busy}
              onMessage={(row) => void queueMessage(row)}
              onCall={(row) => void queueCall(row)}
              onOpenTimeline={(row) => setTimelineRow(row)}
            />
          )}

          <div className="rounded-2xl border border-violet-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
              {literacyMinimal ? t('Top priority', 'Top priority') : t('Engine — pehla target', 'Engine top target')}
            </p>
            <p className="mt-1 text-sm font-semibold text-violet-950">
              {loading
                ? '—'
                : literacyMinimal
                  ? (
                      <span className="tabular-nums">{formatInr(collectAmount)}</span>
                    )
                  : (
                      <>
                        {collectName.split('(')[0].trim()} · {formatInr(collectAmount)}
                      </>
                    )}
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-400">
          {t('Ab karo — WhatsApp / call / system', 'Do it — WhatsApp / call / auto')}
        </p>
        <div ref={actionRef} className="mt-3 flex flex-col gap-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
              onClick={() =>
                setVideoOpen({
                  title: t('WhatsApp reminder', 'WhatsApp reminder'),
                  url: HELP_VIDEOS.whatsapp || HELP_VIDEOS.default,
                })
              }
            >
              <Play className="h-3.5 w-3.5" /> {t('Dikhao', 'Show me')}
            </button>
          </div>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => openConfirm('wa')}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-2xl bg-[#22C55E] py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-50',
              guidedHandActive && guidedStep === 1 && 'ring-4 ring-[#6C3BFF]/60 ring-offset-2 animate-pulse'
            )}
          >
            <MessageCircle className="h-6 w-6" />
            {busy === 'wa'
              ? t('Bhej rahe hain…', 'Sending…')
              : t('WhatsApp bhejo', 'Send WhatsApp')}
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => openConfirm('call')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-white py-4 text-lg font-bold text-violet-950 shadow-md transition hover:bg-violet-50 disabled:opacity-50"
          >
            <Phone className="h-6 w-6" />
            {busy === 'call'
              ? t('Call…', 'Calling…')
              : t('Call karo (Hindi voice)', 'Call (Hindi voice)')}
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => openConfirm('sys')}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-violet-600 py-4 text-lg font-bold text-white shadow-lg shadow-violet-500/30 transition hover:opacity-95 disabled:opacity-50',
              guidedHandActive && guidedStep === 2 && 'ring-4 ring-[#6C3BFF]/60 ring-offset-2 animate-pulse'
            )}
          >
            <Sparkles className="h-6 w-6" />
            {busy === 'sys'
              ? t('Ho raha hai…', 'Working…')
              : t('System ko handle karne do', 'Let system handle')}
          </button>
        </div>

        <Link
          to="/assistant?lang=hi"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 py-4 text-base font-semibold text-violet-900 transition hover:bg-violet-100"
        >
          <Mic className="h-6 w-6" />
          {t('Awaz se poochho — mic', 'Ask by voice — mic')}
        </Link>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/people" className="flex items-center gap-1.5 font-medium text-[#6C3BFF] hover:underline">
            <Users className="h-4 w-4" />
            {t('Saare log (dues)', 'All people (dues)')}
          </Link>
          {!basic && (
            <Link to="/dashboard" className="font-medium text-violet-700/80 hover:underline">
              {t('Poora dashboard →', 'Full dashboard →')}
            </Link>
          )}
          {basic && (
            <span className="text-violet-600/80">
              {t(
                'Advanced mode mein poora dashboard (upar toggle)',
                'Full dashboard in Advanced (toggle above)'
              )}
            </span>
          )}
        </div>

        {user?.helper_approval_required && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-center text-sm text-amber-950">
            {t(
              'Trusted helper mode: sensitive actions ke liye approval flow jald. Abhi demo mein actions block ho sakte hain — Profile se band karein.',
              'Trusted helper mode: approval flow for sensitive actions soon. In demo, actions may be blocked — turn off in Profile.'
            )}
          </p>
        )}

        {error && (
          <p className="mt-6 text-center text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {user?.subscription_tier === 'free' && (
          <div className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-violet-200/80 bg-violet-950/95 px-4 py-2.5 text-xs font-medium text-white shadow-xl md:bottom-8">
            <span className="leading-snug">
              {t(
                'Free tier: outbound messages limited — upgrade for full automation.',
                'Free tier: outbound messages are limited — upgrade for full automation.'
              )}
            </span>
            <Link to="/growth" className="shrink-0 font-bold text-amber-300 underline-offset-2 hover:underline">
              {t('Upgrade', 'Upgrade')}
            </Link>
          </div>
        )}

        {toast && (
          <div
            className={`fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'err'
                ? 'border-red-200 bg-red-50 text-red-900'
                : toast.type === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-violet-200 bg-white text-violet-950'
            }`}
          >
            <p>{toast.text}</p>
            {toast.link && (
              <a href={toast.link} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-medium text-blue-700 underline">
                {t('Link kholo', 'Open link')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

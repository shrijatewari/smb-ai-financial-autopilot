import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Copy, Link2, Mic, Phone, Sparkles, Users, MessageCircle, Wallet, ListTodo, Play } from 'lucide-react'
import {
  buildHindiPaymentScript,
  buildWhatsappCollectionMessage,
  formatInr,
  normalizePhone10,
  openTelDialer,
  openUserGestureBlankTab,
  navigateTabOrOpenWhatsApp,
} from '../lib/collections'
import {
  executeAction,
  fetchCollectionCustomers,
  getApiErrorMessage,
  postExecuteCollect,
  postPaymentLink,
  postTwilioVoiceCall,
} from '../services/api'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { VoiceConfirmModal } from '../components/VoiceConfirmModal'
import { GuidedHandOverlay } from '../components/GuidedHandOverlay'
import { ShowMeVideoModal } from '../components/ShowMeVideoModal'
import { HELP_VIDEOS } from '../constants/helpVideos'
import { speakForLocale, speakHinglish, cancelSpeech } from '../lib/voice'
import { useUiStore } from '../store/uiStore'
import { useAuth } from '../context/AuthContext'
import { useTr } from '../hooks/useTr'
import { Bilingual, pickLine, pickLocaleNode } from '../lib/i18n'
import { layer1FromSnap } from '../lib/todayHeadlines'
import { cn } from '../lib/utils'
import { TodayStatsBar } from '../components/TodayStatsBar'
import { CollectionQueueList } from '../components/CollectionQueueList'
import { CustomerCollectionTimeline } from '../components/CustomerCollectionTimeline'
import { attachMockPayScores } from '../lib/platformMocks'

const DEFAULT_PHONE = '9004930401'
const GUIDED_DONE_KEY = 'SMB_GUIDED_FIRST_DONE'

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
  const [customersByName, setCustomersByName] = useState({})
  /** Last Razorpay short URL for the current primary target – shown beside WhatsApp / Call. */
  const [dashboardPaymentLink, setDashboardPaymentLink] = useState(null)
  const actionRef = useRef(null)
  const paymentLinkPrimeKey = useRef('')
  const headlineSpoken = useRef(false)
  const autoGuidedApplied = useRef(false)

  useEffect(() => {
    fetchCollectionCustomers()
      .then((d) => {
        const m = {}
        for (const c of d.items || []) {
          m[String(c.name || '').trim().toLowerCase()] = c
        }
        setCustomersByName(m)
      })
      .catch(() => {})
  }, [])

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
    if (!snap) return { hi: '', en: '', ta: '', te: '', bn: '', urgent: false }
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

  /** First visit, or once per session when risk is high – guided hand (user can dismiss). */
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
    if (!loading && snap && voiceOn && (line.hi || line.en) && !headlineSpoken.current) {
      headlineSpoken.current = true
      if (localeDisplay === 'both') speakHinglish(line.hinglish ?? line.hi, line.en)
      else speakForLocale(pickLine(line, localeDisplay), localeDisplay)
    }
  }, [loading, snap, line, voiceOn, localeDisplay])

  /** Prime a payment link for the engine’s top target so the dashboard row can show it without sending WhatsApp first. */
  useEffect(() => {
    if (loading || snap == null) return
    const ck = String(collectName || '')
      .trim()
      .toLowerCase()
    const cust = customersByName[ck]
    const key = `${collectName}|${collectAmount}|${phone10}|${cust?.id ?? 'no-id'}`
    if (paymentLinkPrimeKey.current === key) return
    paymentLinkPrimeKey.current = key
    let cancelled = false
    ;(async () => {
      try {
        const res = await postPaymentLink({
          amount: collectAmount,
          customer_name: collectName,
          phone: phone10,
          ...(cust?.id ? { customer_id: cust.id } : {}),
        })
        if (!cancelled && res.payment_link) setDashboardPaymentLink(res.payment_link)
      } catch {
        /* offline / no API – link stays empty until user taps Get link */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, snap, collectName, collectAmount, phone10, customersByName])

  function finishGuided() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(GUIDED_DONE_KEY, '1')
    dismissGuidedHand()
  }

  function receiptVoice(hi, en) {
    if (!voiceOn) return
    if (localeDisplay === 'both') speakHinglish(hi, en)
    else speakForLocale(t(hi, en), localeDisplay)
  }

  function helperBlocks() {
    if (!user?.helper_approval_required) return false
    return true
  }

  async function runWhatsApp() {
    if (helperBlocks()) {
      const hi =
        'Helper approval अभी डेमो में बंद है। प्रोफ़ाइल से हेल्पर नंबर सेव करें – OTP जल्द।'
      const en = 'Helper approval is off in this demo. Save a helper number in Profile – OTP soon.'
      const msg = t(hi, en)
      setToast({ type: 'warn', text: msg })
      receiptVoice(hi, en)
      return
    }
    const waTab = openUserGestureBlankTab()
    setBusy('wa')
    setToast(null)
    try {
      const ck = String(collectName || '')
        .trim()
        .toLowerCase()
      const cust = customersByName[ck]
      const res = await postExecuteCollect({
        customer: collectName,
        phone: phone10,
        amount: collectAmount,
        tone: 'friendly',
        ...(cust?.id ? { customer_id: cust.id } : {}),
      })
      const short = collectName.split('(')[0].trim()
      const okHi = `${formatInr(collectAmount)} का रिमाइंडर ${short} को भेज दिया गया है।`
      const okEn = `Reminder of ${formatInr(collectAmount)} sent to ${short}.`
      if (res.payment_link) setDashboardPaymentLink(res.payment_link)
      setToast({
        type: 'ok',
        text: t(
          'Reminder + Razorpay लिंक भेजा गया (WhatsApp / Meta जब कॉन्फ़िगर हो)।',
          'Reminder + Razorpay link sent (WhatsApp / Meta when configured).'
        ),
        link: res.payment_link || undefined,
      })
      receiptVoice(okHi, okEn)
    } catch (e) {
      const msg = getApiErrorMessage(e)
      let payUrl = null
      try {
        const ck2 = String(collectName || '')
          .trim()
          .toLowerCase()
        const cust2 = customersByName[ck2]
        const pay = await postPaymentLink({
          amount: collectAmount,
          customer_name: collectName,
          phone: phone10,
          ...(cust2?.id ? { customer_id: cust2.id } : {}),
        })
        payUrl = pay.payment_link
        if (payUrl) setDashboardPaymentLink(payUrl)
      } catch {
        /* draft uses DEMO_PAYMENT_LINK_FALLBACK from collections when no link */
      }
      const draft = buildWhatsappCollectionMessage(collectName, collectAmount, 'friendly', payUrl || undefined)
      navigateTabOrOpenWhatsApp(waTab, phone10, draft)
      setToast({
        type: 'warn',
        text: `${msg} – ${t('वॉट्सऐप ड्राफ़्ट खोला (Razorpay लिंक जोड़ा)।', 'WhatsApp draft opened (with Razorpay link).')}`,
        link: payUrl || undefined,
      })
      receiptVoice(
        'WhatsApp ड्राफ़्ट खुल गया – आप वहाँ से भेज सकते हैं।',
        'WhatsApp draft opened – you can send from there.'
      )
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  async function runCall() {
    if (helperBlocks()) {
      const hi = 'Helper approval डेमो: अभी सीधा कॉल करेंगे – OTP फ्लो जल्द।'
      const en = 'Helper approval demo: calling directly for now – OTP flow soon.'
      const msg = t(hi, en)
      setToast({ type: 'warn', text: msg })
      receiptVoice(hi, en)
      return
    }
    setBusy('call')
    setToast(null)
    openTelDialer(phone10)
    const script = buildHindiPaymentScript(collectName, collectAmount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      if (res.mock) {
        setToast({
          type: 'warn',
          text:
            res.detail ||
            t(
              'Twilio set nahi hai – phone dialer khola. Script: ',
              'Twilio not set – phone dialer opened. Script: '
            ) +
              script.slice(0, 80) +
              '…',
        })
        receiptVoice('डायलर खुल गया – आप कॉल कर सकते हैं।', 'Dialer opened – you can place the call.')
      } else {
        setToast({
          type: 'ok',
          text: `${t('कॉल कतार:', 'Call queue:')} ${res.sid || 'ok'}`,
        })
        receiptVoice('कॉल कतार में लग गई।', 'Call queued.')
      }
    } catch (e) {
      setToast({
        type: 'warn',
        text: `${getApiErrorMessage(e)} – ${t('डायलर खोला।', 'dialer opened.')}`,
      })
      receiptVoice('डायलर खुल गया।', 'Dialer opened.')
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 12000)
    }
  }

  async function runSystemHandle() {
    if (helperBlocks()) {
      const hi = 'Helper approval: पेमेंट लिंक डेमो के लिए हेल्पर OTP बाद में।'
      const en = 'Helper approval: helper OTP for payment link demo later.'
      const msg = t(hi, en)
      setToast({ type: 'warn', text: msg })
      receiptVoice(hi, en)
      return
    }
    setBusy('sys')
    setToast(null)
    try {
      const ck = String(collectName || '')
        .trim()
        .toLowerCase()
      const cust = customersByName[ck]
      const payRes = await postPaymentLink({
        amount: collectAmount,
        customer_name: collectName,
        phone: phone10,
        ...(cust?.id ? { customer_id: cust.id } : {}),
      })
      const execPayload = { action: act, reference: `today-${Date.now()}` }
      if (act === 'collect_payment') {
        execPayload.amount = collectAmount
        execPayload.customer = collectName
      }
      await executeAction(execPayload)
      if (payRes.payment_link) setDashboardPaymentLink(payRes.payment_link)
      setToast({
        type: 'ok',
        text: t(
          'सिस्टम ने पेमेंट लिंक + एक्शन लॉग किया।',
          'System created payment link + logged action.'
        ),
        link: payRes.payment_link,
      })
      receiptVoice(
        'पेमेंट लिंक बन गया और सिस्टम ने एक्शन लॉग कर दिया।',
        'Payment link created and the system logged the action.'
      )
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
      receiptVoice(
        'कुछ गड़बड़ हो गई – स्क्रीन पर मैसेज देखें।',
        'Something went wrong – see message on screen.'
      )
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 14000)
    }
  }

  async function copyPaymentLinkOnly() {
    if (helperBlocks()) {
      setToast({ type: 'warn', text: t('हेल्पर अनुमोदन डेमो…', 'Helper approval demo…') })
      return
    }
    setBusy('link')
    setToast(null)
    try {
      const ck = String(collectName || '')
        .trim()
        .toLowerCase()
      const cust = customersByName[ck]
      const res = await postPaymentLink({
        amount: collectAmount,
        customer_name: collectName,
        phone: phone10,
        ...(cust?.id ? { customer_id: cust.id } : {}),
      })
      const url = res.payment_link
      if (url) setDashboardPaymentLink(url)
      if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setToast({
          type: 'ok',
          text: t('पेमेंट लिंक कॉपी हो गया।', 'Payment link copied to clipboard.'),
          link: url,
        })
      } else {
        setToast({
          type: 'ok',
          text: t('पेमेंट लिंक तैयार।', 'Payment link ready.'),
          link: url,
        })
      }
    } catch (e) {
      setToast({ type: 'err', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 12000)
    }
  }

  async function queueMessage(row) {
    if (helperBlocks()) {
      setToast({ type: 'warn', text: t('हेल्पर अनुमोदन डेमो…', 'Helper approval demo…') })
      return
    }
    const waTab = openUserGestureBlankTab()
    setBusy('wa')
    setToast(null)
    const rowKey = String(row.name || '')
      .trim()
      .toLowerCase()
    const rowCust = customersByName[rowKey]
    try {
      const res = await postExecuteCollect({
        customer: row.name,
        phone: phone10,
        amount: Number(row.amount),
        tone: 'friendly',
        ...(rowCust?.id ? { customer_id: rowCust.id } : {}),
      })
      if (res.payment_link) setDashboardPaymentLink(res.payment_link)
      const msg = buildWhatsappCollectionMessage(
        row.name,
        row.amount,
        'friendly',
        res.payment_link || undefined
      )
      navigateTabOrOpenWhatsApp(waTab, phone10, msg)
      setToast({
        type: 'ok',
        text: t('रिमाइंडर + लिंक भेजा गया।', 'Reminder + link sent.'),
        link: res.payment_link || undefined,
      })
    } catch (e) {
      let payUrl = null
      try {
        const pay = await postPaymentLink({
          amount: Number(row.amount),
          customer_name: row.name,
          phone: phone10,
          ...(rowCust?.id ? { customer_id: rowCust.id } : {}),
        })
        payUrl = pay.payment_link
        if (payUrl) setDashboardPaymentLink(payUrl)
      } catch {
        /* demo URL in draft */
      }
      navigateTabOrOpenWhatsApp(
        waTab,
        phone10,
        buildWhatsappCollectionMessage(row.name, row.amount, 'friendly', payUrl || undefined)
      )
      setToast({ type: 'warn', text: getApiErrorMessage(e) })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 8000)
    }
  }

  async function queueCall(row) {
    if (helperBlocks()) {
      setToast({ type: 'warn', text: t('हेल्पर अनुमोदन डेमो…', 'Helper approval demo…') })
      return
    }
    setBusy('call')
    setToast(null)
    openTelDialer(phone10)
    const script = buildHindiPaymentScript(row.name, row.amount)
    try {
      const res = await postTwilioVoiceCall({ phone: phone10, text: script })
      setToast({
        type: res.mock ? 'warn' : 'ok',
        text: res.mock ? t('डायलर', 'Dialer') : t('कॉल कतार में', 'Call queued'),
      })
    } catch (e) {
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
        hi: `आप ${short} को ${amt} का रिमाइंडर भेजने वाले हैं। YES या NO बोलिए।`,
        en: `You are about to send a ${amt} reminder to ${short}. Say YES or NO.`,
      },
      call: {
        hi: `आप ${short} को कॉल करने वाले हैं। YES या NO बोलिए।`,
        en: `You are about to call ${short}. Say YES or NO.`,
      },
      sys: {
        hi: 'आप सिस्टम से पेमेंट लिंक बनाने वाले हैं। YES या NO बोलिए।',
        en: 'You are about to create a payment link from the system. Say YES or NO.',
      },
    }
    const { hi, en } = lines[kind]
    setConfirm({ kind, messageHi: hi, messageEn: en })
    if (voiceOn) {
      if (localeDisplay === 'both') speakHinglish(hi, en)
      else speakForLocale(t(hi, en), localeDisplay)
    }
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
          if (voiceOn) {
            const hi = 'ठीक है, कुछ नहीं किया।'
            const en = 'Okay, nothing was done.'
            if (localeDisplay === 'both') speakHinglish(hi, en)
            else speakForLocale(t(hi, en), localeDisplay)
          }
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
          customerInfo={customersByName[String(timelineRow.name || '').trim().toLowerCase()]}
          busy={!!busy}
          onClose={() => setTimelineRow(null)}
          onWhatsApp={() => {
            void queueMessage(timelineRow)
            setTimelineRow(null)
          }}
          onPaymentLink={async () => {
            setBusy('sys')
            try {
              const tk = String(timelineRow.name || '')
                .trim()
                .toLowerCase()
              const tc = customersByName[tk]
              const res = await postPaymentLink({
                amount: Number(timelineRow.amount),
                customer_name: timelineRow.name,
                phone: phone10,
                ...(tc?.id ? { customer_id: tc.id } : {}),
              })
              const url = res.payment_link
              if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url)
              }
              setToast({
                type: 'ok',
                text: t('पेमेंट लिंक कॉपी हो गया।', 'Payment link copied to clipboard.'),
                link: url,
              })
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
        <div className="text-center text-[11px] font-semibold tracking-[0.2em] text-violet-500">
          <Bilingual
            mode={localeDisplay}
            hi="आज – स्थिति"
            en="Today – status"
            hinglish="Aaj – sthiti"
            regional={{
              ta: 'இன்று – நிலை',
              te: 'ఇవాల్టి – స్థితి',
              bn: 'আজ – অবস্থা',
            }}
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
          ) : localeDisplay === 'both' ? (
            <>
              <span className="block" lang={line.hinglish ? 'hi-Latn' : 'hi'}>
                {line.hinglish ?? line.hi}
              </span>
              <span
                className="mt-2 block text-lg font-semibold leading-snug text-violet-800/90 sm:text-xl"
                lang="en"
              >
                {line.en}
              </span>
            </>
          ) : (
            <span
              lang={
                localeDisplay === 'en'
                  ? 'en'
                  : localeDisplay === 'hi'
                    ? 'hi'
                    : localeDisplay === 'ta'
                      ? 'ta'
                      : localeDisplay === 'te'
                        ? 'te'
                        : localeDisplay === 'bn'
                          ? 'bn'
                          : 'en'
              }
            >
              {pickLine(line, localeDisplay)}
            </span>
          )}
        </motion.h1>

        {!loading && (
          <div className="mt-3 flex justify-center">
            <Link
              to="/assistant?explain=risk"
              className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#6C3BFF] shadow-sm hover:bg-violet-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t('यह नंबर समझाओ', 'Explain this')}
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
            title={t('सिस्टम स्ट्रीम', 'System stream')}
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
              ? t('ट्विन दोबारा जोड़ रहे…', 'Reconnecting twin…')
              : streamStatus === 'live'
                ? t('ट्विन लाइव (SSE)', 'Twin live (SSE)')
                : t('ट्विन शुरू…', 'Twin starting…')}
          </span>
          <Link
            to="/profile"
            className="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 font-medium text-[#6C3BFF] shadow-sm hover:bg-violet-50"
          >
            {t('ब्रीफ़िंग · बैंक · वॉट्सऐप', 'Briefing · bank · WhatsApp')}
          </Link>
          <Link
            to="/profile#profile-notifications"
            className="rounded-full border border-violet-200/50 bg-white/70 px-3 py-1.5 text-violet-800 hover:bg-violet-50"
          >
            {t('ब्रीफ़िंग लॉग', 'Briefing log')}
          </Link>
          <Link
            to="/transactions"
            className="rounded-full border border-violet-200/60 bg-white/60 px-3 py-1.5 text-violet-800 hover:bg-violet-50"
          >
            {t('लेन-देन', 'Transactions')}
          </Link>
        </div>

        {gstCtx?.show_warning && gstCtx.gst_registered && (
          <div className="mt-4 rounded-2xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 text-left shadow-sm">
            <p className="text-sm font-bold text-amber-950">
              {t('GST जल्दी फ़ाइल करें – ड्यू पास है', 'GST filing due within 2 weeks')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-950/90">
              {t(
                `लगभग ${formatInr(gstCtx.estimated_liability_inr)} – देय ${gstCtx.next_due_date ?? '–'}`,
                `Estimated ${formatInr(gstCtx.estimated_liability_inr)} · due ${gstCtx.next_due_date ?? '–'}`,
              )}
            </p>
            {gstCtx.gstin && (
              <p className="mt-1 font-mono text-[11px] text-amber-900/80">GSTIN {gstCtx.gstin}</p>
            )}
            <Link
              to="/gst"
              className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2"
            >
              {t('GST विवरण देखो', 'Open GST page')}
            </Link>
          </div>
        )}

        {basic && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white py-5 shadow-md transition hover:border-[#6C3BFF]/40"
              onClick={() => {
                if (voiceOn) {
                  const hi =
                    cashHint != null
                      ? `आपके पास लगभग ${formatInr(cashHint)} नकद है।`
                      : 'नकद अभी अनुमानित नहीं है।'
                  const en =
                    cashHint != null
                      ? `You have roughly ${formatInr(cashHint)} in cash.`
                      : 'Cash estimate is not available yet.'
                  if (localeDisplay === 'both') speakHinglish(hi, en)
                  else speakForLocale(t(hi, en), localeDisplay)
                }
              }}
            >
              <Wallet className="h-8 w-8 text-[#6C3BFF]" />
              <span className="text-center text-sm font-bold text-violet-950">
                {t('पैसा देखो', 'View cash')}
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
                {t('क्या करना है', 'What to do')}
              </span>
            </button>
            <Link
              to="/people"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50/80 py-5 shadow-md transition hover:border-emerald-400"
            >
              <Users className="h-8 w-8 text-emerald-700" />
              <span className="text-center text-sm font-bold text-emerald-900">
                {t('लोगों से पैसे लो', 'Collect from people')}
              </span>
            </Link>
          </div>
        )}

        {ctx?.flags?.show_inventory_strip && ctx?.inventory_hint && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-center shadow-sm">
            <p className="text-sm font-bold text-amber-950">
              {pickLocaleNode(ctx.inventory_hint.headline, localeDisplay)}
            </p>
            <p className="mt-1 text-xs text-amber-950/90">
              {pickLocaleNode(ctx.inventory_hint.sub, localeDisplay)}
            </p>
            <Link
              to="/inventory"
              className="mt-3 inline-block rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md"
            >
              {pickLocaleNode(ctx.inventory_hint.cta, localeDisplay)}
            </Link>
          </div>
        )}

        {ctx?.flags?.show_service_booking_hint && ctx?.service_hint && (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/95 px-4 py-3 text-center text-sky-950 shadow-sm">
            <p className="text-sm font-bold">{pickLocaleNode(ctx.service_hint.headline, localeDisplay)}</p>
            <p className="mt-1 text-xs opacity-90">{pickLocaleNode(ctx.service_hint.sub, localeDisplay)}</p>
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
              {t('डिफ़ॉल्ट वॉट्सऐप / कॉल नंबर (सभी ग्राहक)', 'Default number for WhatsApp / calls')}
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
              title={t('आज वसूली करें', 'Collect today')}
              subtitle={t('पूरी रैंक सूची – पंक्ति पर टैप करके टाइमलाइन देखो', 'Full ranked list – tap a row for timeline')}
              totalDueLabel={t('कुल', 'Total')}
              busyKey={() => busy}
              onMessage={(row) => void queueMessage(row)}
              onCall={(row) => void queueCall(row)}
              onOpenTimeline={(row) => setTimelineRow(row)}
            />
          )}

          <div className="rounded-2xl border border-violet-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
              {literacyMinimal ? t('सबसे ज़रूरी', 'Top priority') : t('इंजन – पहला लक्ष्य', 'Engine top target')}
            </p>
            <p className="mt-1 text-sm font-semibold text-violet-950">
              {loading
                ? '–'
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

        <p className="mt-10 text-center text-[10px] font-semibold tracking-[0.25em] text-violet-400 normal-case">
          {t('अब करो – वॉट्सऐप · Razorpay लिंक · कॉल', 'Do it – WhatsApp · Razorpay link · call')}
        </p>
        <div ref={actionRef} className="mt-3 flex flex-col gap-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
              onClick={() =>
                setVideoOpen({
                  title: t('वॉट्सऐप रिमाइंडर', 'WhatsApp reminder'),
                  url: HELP_VIDEOS.whatsapp || HELP_VIDEOS.default,
                })
              }
            >
              <Play className="h-3.5 w-3.5" /> {t('दिखाओ', 'Show me')}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-stretch">
            <button
              type="button"
              disabled={!!busy || loading}
              onClick={() => openConfirm('wa')}
              className={cn(
                'flex min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-[#22C55E] px-3 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-50 sm:text-lg',
                guidedHandActive && guidedStep === 1 && 'ring-4 ring-[#6C3BFF]/60 ring-offset-2 animate-pulse'
              )}
            >
              <MessageCircle className="h-6 w-6 shrink-0" />
              <span className="text-center leading-tight">
                {busy === 'wa'
                  ? t('भेज रहे हैं…', 'Sending…')
                  : t('वॉट्सऐप भेजो', 'Send WhatsApp')}
              </span>
            </button>
            <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50/90 px-3 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-emerald-800" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                  {t('Razorpay लिंक', 'Razorpay link')}
                </span>
              </div>
              {dashboardPaymentLink ? (
                <p className="break-all font-mono text-[10px] leading-snug text-emerald-950" title={dashboardPaymentLink}>
                  {dashboardPaymentLink}
                </p>
              ) : (
                <p className="text-[11px] leading-snug text-emerald-800/90">
                  {t('लोड हो रहा है या API ऑफ़लाइन – नीचे बटन से लिंक बनाएँ।', 'Loading or API offline – use the button below.')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy || loading}
                  onClick={() => void copyPaymentLinkOnly()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {busy === 'link'
                    ? t('लिंक…', 'Link…')
                    : t('कॉपी / नया लिंक', 'Copy / refresh link')}
                </button>
                {dashboardPaymentLink && (
                  <a
                    href={dashboardPaymentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    {t('खोलो', 'Open')}
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={!!busy || loading}
              onClick={() => openConfirm('call')}
              className="flex min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-white px-3 py-4 text-base font-bold text-violet-950 shadow-md transition hover:bg-violet-50 disabled:opacity-50 sm:text-lg"
            >
              <Phone className="h-6 w-6 shrink-0" />
              <span className="text-center leading-tight">
                {busy === 'call'
                  ? t('कॉल…', 'Calling…')
                  : t('कॉल करो (हिंदी आवाज़)', 'Call (Hindi voice)')}
              </span>
            </button>
          </div>
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
              ? t('हो रहा है…', 'Working…')
              : t('सिस्टम को संभालने दो', 'Let system handle')}
          </button>
        </div>

        <Link
          to="/assistant?lang=hi"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 py-4 text-base font-semibold text-violet-900 transition hover:bg-violet-100"
        >
          <Mic className="h-6 w-6" />
          {t('आवाज़ से पूछो – माइक', 'Ask by voice – mic')}
        </Link>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/people" className="flex items-center gap-1.5 font-medium text-[#6C3BFF] hover:underline">
            <Users className="h-4 w-4" />
            {t('सारे लोग (बकाया)', 'All people (dues)')}
          </Link>
          {!basic && (
            <Link to="/dashboard" className="font-medium text-violet-700/80 hover:underline">
              {t('पूरा डैशबोर्ड →', 'Full dashboard →')}
            </Link>
          )}
          {basic && (
            <span className="text-violet-600/80">
              {t(
                'उन्नत मोड में पूरा डैशबोर्ड (ऊपर टॉगल)',
                'Full dashboard in Advanced (toggle above)'
              )}
            </span>
          )}
        </div>

        {user?.helper_approval_required && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-center text-sm text-amber-950">
            {t(
              'विश्वसनीय हेल्पर मोड: संवेदनशील क्रियाओं के लिए अनुमोदन फ्लो जल्द। अभी डेमो में क्रियाएँ रुक सकती हैं – प्रोफ़ाइल से बंद करें।',
              'Trusted helper mode: approval flow for sensitive actions soon. In demo, actions may be blocked – turn off in Profile.'
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
                'फ़्री टियर: बाहरी संदेश सीमित – पूर्ण ऑटोमेशन के लिए अपग्रेड करें।',
                'Free tier: outbound messages are limited – upgrade for full automation.'
              )}
            </span>
            <Link to="/growth" className="shrink-0 font-bold text-amber-300 underline-offset-2 hover:underline">
              {t('अपग्रेड', 'Upgrade')}
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={toast.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-blue-700 underline"
                >
                  {t('लिंक खोलो', 'Open link')}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(toast.link)
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                >
                  {t('लिंक कॉपी', 'Copy link')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

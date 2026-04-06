import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Play } from 'lucide-react'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { GuidedHandOverlay } from '../components/GuidedHandOverlay'
import { useSystemSnapshot } from '../context/SystemStreamContext'
import { fetchSimulation } from '../services/api'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'
import { speakForLocale, speakHinglish, cancelSpeech } from '../lib/voice'
import { cn } from '../lib/utils'

function binSamples(samples, bins = 32) {
  if (!samples?.length) return []
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const w = (max - min || 1) / bins
  const out = Array.from({ length: bins }, (_, i) => ({
    x: min + (i + 0.5) * w,
    c: 0,
  }))
  for (const v of samples) {
    let i = Math.floor((v - min) / w)
    if (i >= bins) i = bins - 1
    if (i < 0) i = 0
    out[i].c += 1
  }
  return out.map((b, i) => ({ i, density: b.c, x: b.x }))
}

const PREDICTIONS_GUIDED_KEY = 'SMB_PREDICTIONS_GUIDED_DONE'

export default function Predictions() {
  const t = useTr()
  const { snapshot: snap } = useSystemSnapshot()
  const [sim, setSim] = useState(null)
  const [loading, setLoading] = useState(true)
  const voiceOn = useUiStore((s) => s.voiceGuidanceEnabled)
  const localeDisplay = useUiStore((s) => s.localeDisplay)

  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const announcedRef = useRef(false)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const sm = await fetchSimulation({ paths: 1200 })
        if (!c) setSim(sm)
      } catch {
        if (!c) setSim(null)
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  const hist = binSamples(sim?.terminal_cash_samples || snap?.simulation || [], 36)
  const risk = sim?.probability_of_negative_cash ?? snap?.risk ?? 0

  const guidanceSteps = useMemo(
    () => [
      {
        label: t('चरण १', 'Step 1'),
        text: t(
          'यह बड़ा प्रतिशत “होराइज़न रिस्क” है – आने वाले दिनों में कम से कम एक बार कैश निगेटिव होने की संभावना।',
          'This large percentage is horizon risk – the chance cash goes negative at least once in the forecast window.'
        ),
      },
      {
        label: t('चरण २', 'Step 2'),
        text: t(
          'यह ग्राफ़ मोंटे कार्लो सिमुलेशन के अंत में कैश कहाँ खत्म हो सकता है, उसका बंटवारा दिखाता है।',
          'This curve shows the distribution of ending cash across many simulation paths.'
        ),
      },
      {
        label: t('चरण ३', 'Step 3'),
        text: t(
          'ऊपर स्पीकर आइकन से आवाज़ मार्गदर्शन चालू या बंद कर सकते हो – आज वाले पेज जैसा।',
          'Use the speaker icon in the header to turn voice guidance on or off – same as the Today page.'
        ),
      },
    ],
    [t]
  )

  const speakSummary = useCallback(() => {
    if (!voiceOn) return
    const r = typeof risk === 'number' ? risk : 0
    const pct = (100 * r).toFixed(1)
    const end =
      sim?.expected_cash != null
        ? `₹${Math.round(sim.expected_cash).toLocaleString('en-IN')}`
        : '–'
    const hi = `अनुमान पेज। होराइज़न जोखिम लगभग ${pct} प्रतिशत। अनुमानित अंत कैश लगभग ${end}।`
    const en = `Predictions page. Horizon risk is about ${pct} percent. Expected ending cash is about ${end}.`
    if (localeDisplay === 'both') speakHinglish(hi, en)
    else speakForLocale(localeDisplay === 'hi' ? hi : en, localeDisplay)
  }, [voiceOn, risk, sim, localeDisplay])

  /** Auto voice once when data is ready (like Today headline). */
  useEffect(() => {
    if (loading || !voiceOn) return
    if (announcedRef.current) return
    announcedRef.current = true
    const id = setTimeout(() => speakSummary(), 500)
    return () => clearTimeout(id)
  }, [loading, voiceOn, speakSummary])

  /** First visit: guided overlay (stored like Today’s coach). */
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(PREDICTIONS_GUIDED_KEY)) return
    setGuidedOpen(true)
    setGuidedStep(0)
  }, [])

  function finishGuided() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREDICTIONS_GUIDED_KEY, '1')
    setGuidedOpen(false)
    setGuidedStep(0)
  }

  function replayVoice() {
    cancelSpeech()
    announcedRef.current = false
    speakSummary()
    announcedRef.current = true
  }

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 pb-24 pt-2 sm:px-6">
      <GuidedHandOverlay
        open={guidedOpen}
        step={guidedStep}
        totalSteps={guidanceSteps.length}
        steps={guidanceSteps}
        onNext={() => setGuidedStep((s) => s + 1)}
        onDismiss={finishGuided}
      />

      <PageHeader
        title={t('अनुमान', 'Predictions')}
        subtitle={t(
          'मोंटे कार्लो टर्मिनल कैश और होराइज़न रिस्क – वही इंजन जो लाइव कंट्रोल प्लेन चलाता है।',
          'Monte Carlo terminal cash distribution and horizon risk – same engine as the live control plane.'
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-violet-200"
          onClick={replayVoice}
          disabled={!voiceOn}
          title={voiceOn ? t('सारांश फिर सुनें', 'Play summary again') : t('आवाज़ चालू करें', 'Turn voice on in header')}
        >
          <Play className="h-4 w-4" />
          {t('सारांश सुनें', 'Play voice summary')}
        </Button>
        {!voiceOn && (
          <span className="text-xs text-violet-600">
            {t('हेडर में स्पीकर से आवाज़ चालू करें।', 'Turn on the speaker in the header for voice.')}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className={cn(
            'lg:col-span-1 transition-shadow',
            guidedOpen && guidedStep === 0 && 'ring-4 ring-[#6C3BFF]/50 ring-offset-2'
          )}
        >
          <CardHeader>
            <CardTitle>{t('होराइज़न रिस्क', 'Horizon risk')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-2">
                <p className="text-4xl font-semibold tabular-nums text-[#6C3BFF]">{(100 * risk).toFixed(1)}%</p>
                <p className="text-sm text-violet-950/60">
                  {t('कम से कम एक बार होराइज़न में निगेटिव कैश', 'P(negative cash at least once in horizon)')}
                </p>
                <p className="text-xs text-violet-950/50">
                  {t('अनुमानित अंत कैश (सिम): ', 'Expected end cash (sim): ')}
                  {sim?.expected_cash != null ? `₹${Math.round(sim.expected_cash).toLocaleString('en-IN')}` : '–'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className={cn(
            'lg:col-span-2 transition-shadow',
            guidedOpen && guidedStep === 1 && 'ring-4 ring-[#6C3BFF]/50 ring-offset-2'
          )}
        >
          <CardHeader>
            <CardTitle>{t('टर्मिनल कैश बंटवारा', 'Terminal cash distribution')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hist}>
                  <defs>
                    <linearGradient id="predG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6C3BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={{ borderRadius: 12 }} formatter={(v) => [v, 'Paths']} />
                  <Area type="monotone" dataKey="density" stroke="#6C3BFF" fill="url(#predG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

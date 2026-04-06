import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, Play, Upload } from 'lucide-react'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { GuidedHandOverlay } from '../components/GuidedHandOverlay'
import {
  getApiErrorMessage,
  getBillHistory,
  ingestBillJson,
  ingestBillOcr,
} from '../services/api'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'
import { speakForLocale, speakHinglish, cancelSpeech } from '../lib/voice'
import { cn } from '../lib/utils'

const SAMPLE_JSON = `{
  "bill_number": "BILL-001",
  "timestamp": "2026-04-05T14:30:00",
  "total_amount": 450.00,
  "customer_phone": "9876543210",
  "customer_name": "Ramesh",
  "udhar": false,
  "line_items": [
    { "name": "Lays Classic", "qty": 2, "unit_price": 20.00 },
    { "name": "Maggi Noodles", "qty": 3, "unit_price": 14.00 }
  ]
}`

const BILLS_GUIDED_KEY = 'SMB_BILLS_GUIDED_DONE'

function isNotFoundError(e) {
  const s = e?.response?.status
  const d = String(getApiErrorMessage(e) || '')
  return s === 404 || /^not found$/i.test(d.trim())
}

export default function Bills() {
  const t = useTr()
  const voiceOn = useUiStore((s) => s.voiceGuidanceEnabled)
  const localeDisplay = useUiStore((s) => s.localeDisplay)
  const [tab, setTab] = useState('api')
  const [jsonText, setJsonText] = useState(SAMPLE_JSON)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [udharOcr, setUdharOcr] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [lastResult, setLastResult] = useState(null)
  /** Hard errors only (e.g. bad JSON) – not 404 “API not deployed”. */
  const [error, setError] = useState(null)
  /** Amber: missing /bills on server (GET history or POST ingest). */
  const [apiNotice, setApiNotice] = useState(null)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const spokeRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)

  const guidanceSteps = useMemo(
    () => [
      {
        label: t('चरण १', 'Step 1'),
        text: t(
          'POS / API – JSON yahan paste karke test bhejo. Upload – PDF ya photo se OCR.',
          'Use POS / API to paste JSON and test. Use Upload for a PDF or photo (OCR).'
        ),
      },
      {
        label: t('चरण २', 'Step 2'),
        text: t(
          'Neeche "Last 20 bills" tab history dikhata hai jab backend deploy ho. 404 aaye to naya API deploy karein.',
          'Last 20 bills fills in once your backend exposes GET /bills/history. If you see 404, deploy the latest API.'
        ),
      },
      {
        label: t('चरण ३', 'Step 3'),
        text: t(
          'Header mein speaker se aawaz guidance chalu band – Aaj page jaisa.',
          'Use the speaker in the header to turn voice guidance on or off – same as Today.'
        ),
      },
    ],
    [t]
  )

  const speakIntro = useCallback(() => {
    if (!voiceOn) return
    const hi =
      'Smart bills page. POS se JSON bhejo ya bill upload karo. Stock aur ledger update honge jab API live ho.'
    const en =
      'Smart bills. Send JSON from your POS or upload a bill. Stock and ledger update when your API is deployed.'
    if (localeDisplay === 'both') speakHinglish(hi, en)
    else speakForLocale(localeDisplay === 'hi' ? hi : en, localeDisplay)
  }, [voiceOn, localeDisplay])

  useEffect(() => {
    if (!voiceOn || spokeRef.current) return
    spokeRef.current = true
    const id = setTimeout(() => speakIntro(), 400)
    return () => clearTimeout(id)
  }, [voiceOn, speakIntro])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(BILLS_GUIDED_KEY)) return
    setGuidedOpen(true)
    setGuidedStep(0)
  }, [])

  function finishGuided() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BILLS_GUIDED_KEY, '1')
    setGuidedOpen(false)
    setGuidedStep(0)
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const d = await getBillHistory()
      setHistory(d.items || [])
      setApiNotice(null)
    } catch (e) {
      setHistory([])
      if (isNotFoundError(e)) {
        setApiNotice(
          'Bill history unavailable (GET /bills/history → 404). Deploy the latest backend with /bills routes. Submit JSON or upload may still work if POST /bills/* is deployed.'
        )
      } else {
        setApiNotice(getApiErrorMessage(e) || 'Could not load bill history.')
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function submitJson() {
    setSubmitBusy(true)
    setError(null)
    setLastResult(null)
    try {
      const payload = JSON.parse(jsonText)
      const d = await ingestBillJson(payload)
      setLastResult(d)
      await loadHistory()
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError(t('JSON गलत है – ब्रैकेट और कॉमा चेक करें।', 'Invalid JSON – check brackets and commas.'))
        return
      }
      if (isNotFoundError(e)) {
        setApiNotice(
          'POST /bills/ingest-json returned 404. Deploy the latest backend (bills router + Prisma Bill model), then try again.'
        )
        return
      }
      setError(String(e?.response?.data?.detail || getApiErrorMessage(e) || 'Request failed'))
    } finally {
      setSubmitBusy(false)
    }
  }

  async function onOcrFile(file) {
    if (!file) return
    setOcrBusy(true)
    setError(null)
    setLastResult(null)
    try {
      const d = await ingestBillOcr(file, udharOcr)
      setLastResult(d)
      await loadHistory()
    } catch (e) {
      if (isNotFoundError(e)) {
        setApiNotice(
          'POST /bills/ingest-ocr returned 404. Deploy the latest backend with OCR + /bills routes, then try again.'
        )
        return
      }
      setError(getApiErrorMessage(e))
    } finally {
      setOcrBusy(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 pb-24 pt-8 sm:px-6">
      <GuidedHandOverlay
        open={guidedOpen}
        step={guidedStep}
        totalSteps={guidanceSteps.length}
        steps={guidanceSteps}
        onNext={() => setGuidedStep((s) => s + 1)}
        onDismiss={finishGuided}
      />
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Smart bills"
          subtitle="POS JSON ya bill scan – stock update + ledger + khaata proof (WhatsApp)."
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-violet-200"
            onClick={() => {
              cancelSpeech()
              spokeRef.current = false
              speakIntro()
              spokeRef.current = true
            }}
            disabled={!voiceOn}
            title={voiceOn ? t('दोबारा सुनें', 'Play again') : t('हेडर में स्पीकर चालू करें', 'Turn on speaker in header')}
          >
            <Play className="h-4 w-4" />
            {t('आवाज़ सुनें', 'Voice summary')}
          </Button>
          {!voiceOn && (
            <span className="text-xs text-violet-600">
              {t('मार्गदर्शन के लिए हेडर में स्पीकर चालू करें।', 'Turn on the header speaker for guidance.')}
            </span>
          )}
        </div>

        <div
          className={cn(
            'mb-6 flex gap-2 rounded-full border border-violet-200/80 bg-white/60 p-1',
            guidedOpen && guidedStep === 0 && 'ring-2 ring-[#6C3BFF]/40 ring-offset-2'
          )}
        >
          <button
            type="button"
            onClick={() => setTab('api')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === 'api' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            }`}
          >
            POS / API
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === 'upload' ? 'bg-[#6C3BFF] text-white shadow' : 'text-violet-800 hover:bg-white/80'
            }`}
          >
            Upload bill
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        )}

        {apiNotice && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {apiNotice}
          </p>
        )}

        {tab === 'api' && (
          <Card className="border-violet-200/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-[#6C3BFF]" />
                JSON format (POST /bills/ingest-json)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="overflow-x-auto rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs text-violet-900">
                {SAMPLE_JSON}
              </pre>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={14}
                className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 font-mono text-sm"
              />
              <Button type="button" disabled={submitBusy} onClick={() => void submitJson()}>
                {submitBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit test bill'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === 'upload' && (
          <Card className="border-violet-200/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-5 w-5 text-[#6C3BFF]" />
                PDF / image
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-violet-800">
                <input
                  type="checkbox"
                  checked={udharOcr}
                  onChange={(e) => setUdharOcr(e.target.checked)}
                />
                Udhar – match phone par balance jodein
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) void onOcrFile(f)
                }}
                className={`flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                  dragOver ? 'border-[#6C3BFF] bg-[#6C3BFF]/5' : 'border-violet-200 bg-white/70'
                }`}
              >
                {ocrBusy ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-violet-800">
                    <Loader2 className="h-5 w-5 animate-spin text-[#6C3BFF]" />
                    Bill padh raha hoon…
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-violet-800">Drag & drop PDF / JPG / PNG</p>
                    <label className="mt-3 cursor-pointer text-sm font-semibold text-[#6C3BFF] underline">
                      Choose file
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void onOcrFile(f)
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {lastResult && (
          <Card className="mt-6 border-emerald-200/90 bg-emerald-50/30">
            <CardHeader>
              <CardTitle className="text-base">Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950">
              <p>
                Status: <span className="font-semibold">{lastResult.status}</span> · Items updated:{' '}
                {lastResult.items_updated} · Khaata linked:{' '}
                <span className={lastResult.khaata_linked ? 'text-emerald-700' : 'text-violet-600'}>
                  {lastResult.khaata_linked ? 'yes' : 'no'}
                </span>
              </p>
              {lastResult.unknown_items?.length > 0 && (
                <p className="text-amber-800">
                  Unknown inventory: {lastResult.unknown_items.join(', ')}
                </p>
              )}
              {lastResult.parsed_preview && (
                <pre className="max-h-48 overflow-auto rounded-lg bg-white/80 p-2 text-xs">
                  {JSON.stringify(lastResult.parsed_preview, null, 2)}
                </pre>
              )}
              {lastResult.parsed_preview?.customer_phone && (
                <p className="text-emerald-800">
                  {lastResult.khaata_linked
                    ? `Khaata link ho gaya – ${lastResult.parsed_preview.customer_name || 'customer'}`
                    : 'Koi matching customer nahi mila (phone se)'}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card
          className={cn(
            'mt-8 border-violet-200/90',
            guidedOpen && guidedStep === 1 && 'ring-2 ring-[#6C3BFF]/40 ring-offset-2'
          )}
        >
          <CardHeader>
            <CardTitle className="text-base">Last 20 bills</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <p className="text-sm text-violet-600">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-violet-600">
                {apiNotice ? 'No rows (history API unavailable).' : 'No bills yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-violet-100 text-xs text-violet-600">
                      <th className="pb-2 pr-2">Time</th>
                      <th className="pb-2 pr-2">Source</th>
                      <th className="pb-2 pr-2">Amount</th>
                      <th className="pb-2 pr-2">Items Δ</th>
                      <th className="pb-2 pr-2">Khaata</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-violet-50">
                        <td className="py-2 pr-2 font-mono text-xs text-violet-800">
                          {h.timestamp?.slice(0, 19)?.replace('T', ' ') || '–'}
                        </td>
                        <td className="py-2 pr-2">{h.source}</td>
                        <td className="py-2 pr-2">₹{Number(h.total_amount).toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-2">{h.items_updated_count}</td>
                        <td className="py-2 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              h.khaata_linked ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-700'
                            }`}
                          >
                            {h.khaata_linked ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="py-2">{h.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

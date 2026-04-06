import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic, Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage, postAssistantQuery, resolveBackendMediaUrl } from '../services/api'

function getSpeechRecognition() {
  return typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null
}

function speakText(text, enabled, langUi) {
  if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = langUi === 'hi' ? 'hi-IN' : 'en-IN'
  u.rate = 1
  window.speechSynthesis.speak(u)
}

export default function Assistant() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text:
        'Ask about cash risk, balance, what to do next, or collections – in English or Hindi / Hinglish. Use the mic or type.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(true)
  const [uiLang, setUiLang] = useState('en')
  const [tone, setTone] = useState('formal')
  const [includeAudioServer, setIncludeAudioServer] = useState(true)
  const speakRef = useRef(true)
  const uiLangRef = useRef('en')
  const recRef = useRef(null)
  const bottomRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    speakRef.current = speakReplies
  }, [speakReplies])

  useEffect(() => {
    uiLangRef.current = uiLang
  }, [uiLang])

  useEffect(() => {
    const l = searchParams.get('lang')
    if (l === 'hi' || l === 'en') {
      setUiLang(l)
      return
    }
    if (user?.conversation_language === 'hi' || user?.conversation_language === 'en') {
      setUiLang(user.conversation_language)
    }
  }, [searchParams, user?.conversation_language])

  /** Platform lab – “Explain this” from Today pre-fills a plain-language question. */
  useEffect(() => {
    const ex = searchParams.get('explain')
    if (ex === 'risk') {
      setInput(
        'Explain in simple Hindi and English what the cash risk / runway message on my Today screen means and what I should do first.'
      )
      return
    }
    const q = searchParams.get('q')
    if (q && q.trim()) {
      setInput(decodeURIComponent(q.trim()))
    }
  }, [searchParams])

  const speechSupported = !!getSpeechRecognition()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuery = useCallback(
    async (text) => {
      const q = text.trim()
      if (!q || loading) return
      setMessages((m) => [...m, { role: 'user', text: q }])
      setInput('')
      setLoading(true)
      try {
        const lang = uiLangRef.current
        const res = await postAssistantQuery(q, {
          language: lang,
          tone,
          include_audio: includeAudioServer,
        })
        const reply = res.response || ''
        const showDebug =
          typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
        const metaParts = []
        if (showDebug) {
          if (res.intent) metaParts.push(`Intent: ${res.intent}`)
          if (res.detected_query_language) metaParts.push(`Heard: ${res.detected_query_language}`)
          if (res.language) metaParts.push(`Reply: ${res.language}`)
        }
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: reply,
            meta: metaParts.length ? metaParts.join(' · ') : null,
            audioUrl: res.audio_url || null,
          },
        ])
        if (res.audio_url) {
          try {
            if (audioRef.current) {
              audioRef.current.pause()
              audioRef.current.src = ''
            }
            const url = resolveBackendMediaUrl(res.audio_url)
            const el = new Audio(url)
            audioRef.current = el
            el.play().catch(() => {
              speakText(reply, speakRef.current, lang)
            })
          } catch {
            speakText(reply, speakRef.current, lang)
          }
        } else {
          speakText(reply, speakRef.current, lang)
        }
      } catch (e) {
        const err = getApiErrorMessage(e)
        setMessages((m) => [...m, { role: 'assistant', text: err, error: true }])
      } finally {
        setLoading(false)
      }
    },
    [loading, tone, includeAudioServer]
  )

  function startListening() {
    const SR = getSpeechRecognition()
    if (!SR) return
    if (listening) return
    const rec = new SR()
    const lang = uiLangRef.current
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onstart = () => setListening(true)
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onerror = () => setListening(false)
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      if (transcript?.trim()) sendQuery(transcript)
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      setListening(false)
    }
  }

  function stopListening() {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-transparent to-violet-50/30">
      <header className="border-b border-violet-200/40 bg-white/50 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-violet-950">AI assistant</h1>
            <p className="text-xs text-violet-950/55">
              India-first: Hindi, Hinglish, English – voice + text financial guidance
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-violet-950/50">
              Reply language defaults from{' '}
              <Link
                to="/profile#conv-lang"
                className="font-medium text-[#6C3BFF]/90 underline-offset-2 hover:text-[#6C3BFF] hover:underline"
              >
                Profile → Assistant / voice language
              </Link>
              {user?.conversation_language === 'hi' || user?.conversation_language === 'en'
                ? ` (${user.conversation_language === 'hi' ? 'हिंदी' : 'English'})`
                : ''}
              . Use the EN / हिंदी toggles here to override for this session only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-violet-800/70">Language</span>
            <div className="inline-flex rounded-lg border border-violet-200/80 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setUiLang('en')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  uiLang === 'en'
                    ? 'bg-[#6C3BFF] text-white shadow-sm'
                    : 'text-violet-800 hover:bg-violet-50'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setUiLang('hi')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  uiLang === 'hi'
                    ? 'bg-[#6C3BFF] text-white shadow-sm'
                    : 'text-violet-800 hover:bg-violet-50'
                }`}
              >
                हिंदी
              </button>
            </div>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="rounded-lg border border-violet-200/80 bg-white px-2 py-1.5 text-xs text-violet-950 shadow-sm"
              title="Tone (friendly uses OpenAI polish when API key is set)"
            >
              <option value="formal">Formal</option>
              <option value="friendly">Friendly (Hinglish)</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-violet-800/80">
              <input
                type="checkbox"
                checked={speakReplies}
                onChange={(e) => setSpeakReplies(e.target.checked)}
                className="rounded border-violet-300"
              />
              Speak
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-violet-800/80"
              title="Play gTTS MP3 from server (extra network call)"
            >
              <input
                type="checkbox"
                checked={includeAudioServer}
                onChange={(e) => setIncludeAudioServer(e.target.checked)}
                className="rounded border-violet-300"
              />
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
              Server voice
            </label>
            <Link to="/" className="text-sm font-medium text-[#6C3BFF] hover:underline">
              Twin home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-[#6C3BFF] to-violet-600 text-white shadow-lg shadow-[#6C3BFF]/25'
                    : msg.error
                      ? 'border border-red-100 bg-red-50 text-red-900'
                      : 'border border-violet-200/60 bg-white/90 text-violet-950 shadow-md backdrop-blur'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.meta && (
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-neutral-400">{msg.meta}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-violet-200/60 bg-white/80 px-4 py-3 text-sm text-violet-600">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-3 border-t border-violet-200/40 bg-white/40 pt-4 backdrop-blur">
          {!speechSupported && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Speech recognition is not available in this browser. Use Chrome or Edge, or type your question.
            </p>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              sendQuery(input)
            }}
          >
            <div className="flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  uiLang === 'hi'
                    ? 'जैसे: मेरा रिस्क क्या है? मुझे क्या करना चाहिए?'
                    : 'e.g. What is my cash risk? What should I do?'
                }
                className="w-full rounded-xl border border-violet-200/80 bg-white/90 px-4 py-3 text-sm text-violet-950 shadow-sm focus:border-[#6C3BFF]/40 focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/20"
                disabled={loading}
              />
            </div>
            {speechSupported && (
              <motion.button
                type="button"
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                animate={
                  listening
                    ? { boxShadow: ['0 0 0 0 rgba(108,59,255,0.4)', '0 0 0 12px rgba(108,59,255,0)'] }
                    : {}
                }
                transition={listening ? { repeat: Infinity, duration: 1.2 } : {}}
                className={`flex shrink-0 items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition ${
                  listening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-violet-200 bg-white text-violet-900 hover:bg-violet-50'
                } disabled:opacity-50`}
                title={listening ? 'Stop' : 'Speak'}
              >
                <Mic className="h-5 w-5" />
              </motion.button>
            )}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-[#6C3BFF] to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#6C3BFF]/25 hover:opacity-95 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

/**
 * Browser TTS (SpeechSynthesis) with locale-appropriate voices for Indian languages.
 */

import { normalizeLocaleMode } from './i18n.jsx'

/** Cleared when Hinglish schedules English; cancelSpeech() clears this too. */
let _hinglishTimeoutId = null
/** Incremented on cancelSpeech so Hinglish callbacks do not run after mute. */
let _speakNonce = 0

function pickVoiceForLang(langPrefix) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  const p = langPrefix.toLowerCase()
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith(p)) ||
    voices.find((v) => v.lang?.toLowerCase().includes(p.split('-')[0])) ||
    voices[0] ||
    null
  )
}

export function cancelSpeech() {
  if (_hinglishTimeoutId != null) {
    clearTimeout(_hinglishTimeoutId)
    _hinglishTimeoutId = null
  }
  _speakNonce++
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

/** BCP-47 tags for utterances (India defaults). */
const LANG = {
  hi: 'hi-IN',
  en: 'en-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
}

/**
 * Speak Hindi text. Uses rate slightly slower for clarity.
 */
export function speakHindi(text, { rate = 0.92, onEnd, skipInitialCancel = false } = {}) {
  speakWithLang(text, LANG.hi, { rate, onEnd, skipInitialCancel })
}

/**
 * Speak English (Indian English voice when available).
 */
export function speakEnglish(text, { rate = 0.95, onEnd, skipInitialCancel = false } = {}) {
  speakWithLang(text, LANG.en, { rate, onEnd, skipInitialCancel })
}

function speakWithLang(text, bcp47, { rate = 0.92, onEnd, skipInitialCancel = false } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.()
    return
  }
  if (!skipInitialCancel) cancelSpeech()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = bcp47
  const prefix = bcp47.split('-')[0]
  const v = pickVoiceForLang(prefix)
  if (v) u.voice = v
  u.rate = rate
  if (onEnd) u.onend = () => onEnd()
  window.speechSynthesis.speak(u)
}

/**
 * Hinglish: Hindi line then English line (short gap).
 */
export function speakHinglish(hiText, enText, { rate = 0.92 } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return
  }
  cancelSpeech()
  const nonce = _speakNonce
  speakHindi(hiText, {
    rate,
    skipInitialCancel: true,
    onEnd: () => {
      if (nonce !== _speakNonce) return
      _hinglishTimeoutId = window.setTimeout(() => {
        _hinglishTimeoutId = null
        if (nonce !== _speakNonce) return
        speakEnglish(enText, { rate })
      }, 280)
    },
  })
}

/**
 * @param {string} text – already in the target language
 * @param {'hi'|'en'|'both'|'ta'|'te'|'bn'} locale
 */
export function speakForLocale(text, locale, options = {}) {
  if (!text) return
  const m = normalizeLocaleMode(locale)
  if (m === 'both') {
    return
  }
  if (m === 'hi') {
    speakHindi(text, options)
    return
  }
  if (m === 'en') {
    speakEnglish(text, options)
    return
  }
  if (m === 'ta') {
    speakWithLang(text, LANG.ta, options)
    return
  }
  if (m === 'te') {
    speakWithLang(text, LANG.te, options)
    return
  }
  if (m === 'bn') {
    speakWithLang(text, LANG.bn, options)
    return
  }
}

/** Call once on app mount so voices populate (Chrome quirk). */
export function warmSpeechVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const load = () => window.speechSynthesis.getVoices()
  load()
  window.speechSynthesis.onvoiceschanged = load
}

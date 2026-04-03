/**
 * Hindi-first browser TTS (SpeechSynthesis). Falls back to default voice if hi-IN missing.
 */

function pickHindiVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith('hi')) ||
    voices.find((v) => v.lang?.toLowerCase().includes('hi')) ||
    voices[0] ||
    null
  )
}

export function cancelSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Speak Hindi text. Uses rate slightly slower for clarity.
 */
export function speakHindi(text, { rate = 0.92, onEnd } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.()
    return
  }
  cancelSpeech()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'hi-IN'
  const v = pickHindiVoice()
  if (v) u.voice = v
  u.rate = rate
  if (onEnd) u.onend = () => onEnd()
  window.speechSynthesis.speak(u)
}

/** Call once on app mount so voices populate (Chrome quirk). */
export function warmSpeechVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const load = () => window.speechSynthesis.getVoices()
  load()
  window.speechSynthesis.onvoiceschanged = load
}

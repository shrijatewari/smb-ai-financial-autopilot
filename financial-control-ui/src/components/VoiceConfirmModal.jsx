import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speakForLocale, speakHinglish, cancelSpeech } from '../lib/voice'
import { useUiStore } from '../store/uiStore'
import { useTr } from '../hooks/useTr'

/**
 * Voice-first confirmation: TTS follows display language (EN / HI / HI+EN / TA / TE / BN).
 */
export function VoiceConfirmModal({ open, title, message, messageHi, messageEn, onConfirm, onCancel }) {
  const t = useTr()
  const localeDisplay = useUiStore((s) => s.localeDisplay)
  const voiceOn = useUiStore((s) => s.voiceGuidanceEnabled)
  const hi = messageHi ?? message
  const en = messageEn ?? message

  useEffect(() => {
    if (!open || !voiceOn) return
    if (messageEn != null && messageHi != null) {
      if (localeDisplay === 'both') speakHinglish(hi, en)
      else speakForLocale(t(hi, en), localeDisplay)
    } else if (message) {
      speakForLocale(message, localeDisplay)
    }
    return () => cancelSpeech()
  }, [open, hi, en, message, voiceOn, localeDisplay, t, messageHi, messageEn])

  const bodyLang =
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
              : undefined

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="voice-confirm-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-md rounded-3xl border-2 border-violet-200 bg-white p-6 shadow-2xl"
          >
            <h2 id="voice-confirm-title" className="text-lg font-bold text-violet-950">
              {title || t('पुष्टि करें', 'Confirm')}
            </h2>
            <div className="mt-3 text-base leading-relaxed text-violet-900/90">
              {messageEn != null && messageHi != null ? (
                localeDisplay === 'both' ? (
                  <>
                    <p lang="hi">{hi}</p>
                    <p lang="en" className="mt-2 text-sm text-violet-700/95">
                      {en}
                    </p>
                  </>
                ) : (
                  <p lang={bodyLang}>{t(hi, en)}</p>
                )
              ) : (
                <p>{message}</p>
              )}
            </div>
            <p className="mt-2 text-xs text-violet-600">
              {t('YES या NO बोलिए – या नीचे दबाएँ।', 'Say YES or NO – or tap below.')}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-600/25"
                onClick={() => {
                  cancelSpeech()
                  onConfirm?.()
                }}
              >
                {t('हाँ (Yes)', 'Yes')}
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl border-2 border-violet-300 bg-white py-4 text-lg font-bold text-violet-950"
                onClick={() => {
                  cancelSpeech()
                  onCancel?.()
                }}
              >
                {t('नहीं (No)', 'No')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

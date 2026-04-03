import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useTr } from '../hooks/useTr'

/**
 * Step-by-step coach; pairs with data-guided-step on targets + pulse classes.
 */
export function GuidedHandOverlay({ open, step, onNext, onDismiss, totalSteps = 3 }) {
  const t = useTr()
  const idx = Math.min(Math.max(0, step), totalSteps - 1)

  const steps = [
    {
      label: t('Step 1', 'Step 1'),
      text: t(
        'Yahan customer ka number daalo ya check karo.',
        'Enter or check the customer phone number here.'
      ),
    },
    {
      label: t('Step 2', 'Step 2'),
      text: t(
        'Ek kaam chuno — WhatsApp, call, ya system.',
        'Pick one action — WhatsApp, call, or system.'
      ),
    },
    {
      label: t('Step 3', 'Step 3'),
      text: t(
        'Haan / Nahi se confirm karo — phir result sunoge.',
        'Confirm with Yes / No — then you will hear the result.'
      ),
    },
  ]

  const s = steps[idx] || steps[0]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-auto fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden />
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[91] rounded-t-3xl border border-violet-200/80 bg-white p-6 shadow-2xl sm:bottom-8 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#6C3BFF]">{s.label}</p>
                <p className="mt-2 text-lg font-semibold leading-snug text-violet-950">{s.text}</p>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-full p-2 text-violet-600 hover:bg-violet-100"
                aria-label={t('Band karo', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex gap-3">
              {idx < totalSteps - 1 ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-violet-600 py-3.5 text-base font-bold text-white shadow-lg"
                >
                  {t('Aage →', 'Next →')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white"
                >
                  {t('Samajh gaya', 'Got it')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

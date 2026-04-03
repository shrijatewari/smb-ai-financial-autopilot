import { AnimatePresence, motion } from 'framer-motion'
import { Play, X } from 'lucide-react'

export function ShowMeVideoModal({ open, title, embedUrl, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-black shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-violet-950 px-4 py-3 text-white">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Play className="h-4 w-4" />
                {title || 'Dekho kaise karein'}
              </span>
              <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Band">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              {embedUrl ? (
                <iframe
                  title={title || 'Help video'}
                  src={embedUrl}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">
                  Video URL profile / admin se jodein (demo placeholder).
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

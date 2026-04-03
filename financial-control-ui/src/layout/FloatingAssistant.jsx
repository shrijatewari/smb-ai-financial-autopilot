import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function FloatingAssistant() {
  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50 md:bottom-8 md:right-8"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      <Link
        to="/assistant"
        className="group relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6C3BFF] to-violet-600 text-white shadow-[0_8px_32px_-4px_rgba(108,59,255,0.55)] transition hover:scale-105 hover:shadow-[0_12px_40px_-4px_rgba(108,59,255,0.65)]"
        aria-label="Open AI assistant"
      >
        <span className="absolute inset-0 rounded-2xl bg-emerald-400/40 opacity-0 blur-xl transition group-hover:opacity-100" />
        <Sparkles className="relative h-6 w-6" />
      </Link>
    </motion.div>
  )
}

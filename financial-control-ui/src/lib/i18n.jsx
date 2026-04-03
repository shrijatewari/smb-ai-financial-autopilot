/**
 * UI copy: Hindi, English, or both (stacked or compact).
 * Voice/TTS stays Hindi-first elsewhere; this only affects on-screen text.
 */

import { cn } from './utils'

/** @typedef {'hi' | 'en' | 'both'} LocaleDisplay */

/**
 * @param {LocaleDisplay} mode
 * @param {string} hi
 * @param {string} en
 */
export function tr(mode, hi, en) {
  if (mode === 'en') return en
  if (mode === 'hi') return hi
  return `${hi} · ${en}`
}

/**
 * Two-line block: Hindi primary, English secondary (when mode is `both`).
 */
export function Bilingual({ mode, hi, en, className = '', subClassName = '' }) {
  if (mode === 'en') {
    return <p className={className}>{en}</p>
  }
  if (mode === 'hi') {
    return <p className={className}>{hi}</p>
  }
  return (
    <p className={className}>
      <span className="block">{hi}</span>
      <span className={cn('mt-1 block text-xs font-normal leading-snug text-violet-600/90', subClassName)}>{en}</span>
    </p>
  )
}

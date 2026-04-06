/**
 * UI copy: Hindi, English, Hinglish (both), or Indian regional (Tamil, Telugu, Bengali).
 *
 * Contract:
 * - `en` mode → English only (`en` arg).
 * - `hi` mode → Devanagari Hindi only (`hi` arg).
 * - `both` (HI+EN) → Roman transliterated Hindi + English: `regional.hinglish · en`.
 *   If `hinglish` is omitted, falls back to Devanagari `hi` for the first segment (legacy).
 * Voice uses matching TTS locale in `voice.js`.
 */

import { cn } from './utils'

/** @typedef {'hi' | 'en' | 'both' | 'ta' | 'te' | 'bn'} LocaleDisplay */

const VALID_LOCALES = new Set(['hi', 'en', 'both', 'ta', 'te', 'bn'])

/**
 * Persist / URL can leave `localeDisplay` invalid; never treat unknown as English (that looked like "UI not updating").
 */
export function normalizeLocaleMode(mode) {
  if (mode != null && VALID_LOCALES.has(mode)) return mode
  return 'both'
}

/**
 * @param {LocaleDisplay | string | undefined | null} mode
 * @param {string} hi – Devanagari Hindi
 * @param {string} en – English
 * @param {{ ta?: string, te?: string, bn?: string, hinglish?: string }} [regional]
 *   `hinglish` – Hindi in Roman script for `both` mode (first segment before middle dot + English).
 */
export function tr(mode, hi, en, regional = {}) {
  const m = normalizeLocaleMode(mode)
  if (m === 'en') return en
  if (m === 'hi') return hi
  if (m === 'both') {
    const hPart = regional.hinglish ?? hi
    return `${hPart} · ${en}`
  }
  if (m === 'ta' && regional.ta) return regional.ta
  if (m === 'te' && regional.te) return regional.te
  if (m === 'bn' && regional.bn) return regional.bn
  return en
}

/**
 * API field: string (legacy) or per-locale object from backend.
 * @param {string | Record<string, string> | null | undefined} node
 * @param {LocaleDisplay} mode
 */
export function pickLocaleNode(node, mode) {
  const m = normalizeLocaleMode(mode)
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (m === 'both') {
    const hPart = node.hinglish ?? node.hi ?? ''
    const en = node.en ?? ''
    return hPart && en ? `${hPart} · ${en}` : hPart || en
  }
  if (m === 'en') return node.en ?? node.hi ?? ''
  if (m === 'hi') return node.hi ?? node.en ?? ''
  if (m === 'ta') return node.ta ?? node.en ?? node.hi ?? ''
  if (m === 'te') return node.te ?? node.en ?? node.hi ?? ''
  if (m === 'bn') return node.bn ?? node.en ?? node.hi ?? ''
  return node.en ?? ''
}

/**
 * Today headline / line objects with optional regional scripts.
 * @param {{ hi: string, en: string, ta?: string, te?: string, bn?: string, hinglish?: string }} line
 * @param {LocaleDisplay} mode
 */
export function pickLine(line, mode) {
  const m = normalizeLocaleMode(mode)
  if (!line) return ''
  if (m === 'en') return line.en
  if (m === 'hi') return line.hi
  if (m === 'both') {
    const hPart = line.hinglish ?? line.hi
    return `${hPart} · ${line.en}`
  }
  if (m === 'ta') return line.ta ?? line.en
  if (m === 'te') return line.te ?? line.en
  if (m === 'bn') return line.bn ?? line.en
  return line.en
}

/**
 * Two-line block: Hindi primary, English secondary (when mode is `both`).
 * For `both`, first line is Roman `hinglish` when provided, else Devanagari `hi`.
 * Regional modes: single line in that script (falls back to English copy).
 */
export function Bilingual({ mode, hi, en, regional = {}, hinglish, className = '', subClassName = '' }) {
  const m = normalizeLocaleMode(mode)
  /** Parent often passes `uppercase`; that must not apply to Indic scripts. */
  const scriptClass = (extra) => cn(extra, 'normal-case')
  if (m === 'en') {
    return (
      <p className={className} lang="en">
        {en}
      </p>
    )
  }
  if (m === 'hi') {
    return (
      <p className={scriptClass(className)} lang="hi">
        {hi}
      </p>
    )
  }
  if (m === 'both') {
    const first = hinglish ?? regional.hinglish ?? hi
    const romanFirst = !!(hinglish ?? regional.hinglish)
    return (
      <p className={className}>
        <span className={scriptClass('block')} lang={romanFirst ? 'hi-Latn' : 'hi'}>
          {first}
        </span>
        <span className={cn('mt-1 block text-xs font-normal leading-snug text-violet-600/90', subClassName)} lang="en">
          {en}
        </span>
      </p>
    )
  }
  if (m === 'ta') {
    const t = regional.ta ?? en
    return (
      <p className={scriptClass(className)} lang="ta">
        {t}
      </p>
    )
  }
  if (m === 'te') {
    const t = regional.te ?? en
    return (
      <p className={scriptClass(className)} lang="te">
        {t}
      </p>
    )
  }
  if (m === 'bn') {
    const t = regional.bn ?? en
    return (
      <p className={scriptClass(className)} lang="bn">
        {t}
      </p>
    )
  }
  return (
    <p className={className} lang="en">
      {en}
    </p>
  )
}

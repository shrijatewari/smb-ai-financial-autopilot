import { useCallback } from 'react'
import { tr } from '../lib/i18n'
import { useUiStore } from '../store/uiStore'

/** Returns `t(hi, en, regional?)` bound to current display language. */
export function useTr() {
  const mode = useUiStore((s) => s.localeDisplay)
  return useCallback((hi, en, regional) => tr(mode, hi, en, regional || {}), [mode])
}

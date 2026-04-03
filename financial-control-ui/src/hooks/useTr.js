import { useCallback } from 'react'
import { tr } from '../lib/i18n'
import { useUiStore } from '../store/uiStore'

/** Returns `t(hi, en)` bound to current display language (hi | en | both). */
export function useTr() {
  const mode = useUiStore((s) => s.localeDisplay)
  return useCallback((hi, en) => tr(mode, hi, en), [mode])
}

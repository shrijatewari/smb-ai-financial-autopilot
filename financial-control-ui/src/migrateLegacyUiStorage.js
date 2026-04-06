/**
 * Run before Zustand rehydrates so `smb-ui-storage-v2` picks up prefs from `smb-ui-storage`.
 */
import { normalizeLocaleMode } from './lib/i18n.jsx'

const OLD_KEY = 'smb-ui-storage'
const NEW_KEY = 'smb-ui-storage-v2'

try {
  if (typeof localStorage === 'undefined') {
    // noop
  } else if (!localStorage.getItem(NEW_KEY)) {
    const raw = localStorage.getItem(OLD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const state = parsed?.state
      if (state && typeof state === 'object') {
        const migrated = {
          state: {
            uiMode: state.uiMode ?? 'basic',
            localeDisplay: normalizeLocaleMode(state.localeDisplay),
            voiceGuidanceEnabled: state.voiceGuidanceEnabled !== false,
          },
          version: 0,
        }
        localStorage.setItem(NEW_KEY, JSON.stringify(migrated))
      }
    }
  }
} catch {
  /* ignore corrupt localStorage */
}

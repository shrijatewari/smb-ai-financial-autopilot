import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeLocaleMode } from '../lib/i18n.jsx'

export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      assistantOpen: false,
      /** 'basic' = 3-button style + reduced nav; 'advanced' = full dashboard & nav */
      uiMode: 'basic',
      /** Screen text + TTS: hi | en | both (Hinglish) | ta | te | bn */
      localeDisplay: 'both',
      voiceGuidanceEnabled: true,
      guidedHandActive: false,
      guidedStep: 0,
      /** Cmd+K command palette (search customers, jump, actions). */
      commandPaletteOpen: false,
      /** Brief highlight on notification bell when a receivable clears from the engine queue. */
      bellPaymentHighlight: false,
      setBellPaymentHighlight: (bellPaymentHighlight) => set({ bellPaymentHighlight }),
      dismissBellPaymentHighlight: () => set({ bellPaymentHighlight: false }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setAssistantOpen: (open) => set({ assistantOpen: open }),
      setUiMode: (uiMode) => set({ uiMode }),
      setLocaleDisplay: (localeDisplay) => set({ localeDisplay }),
      setVoiceGuidanceEnabled: (voiceGuidanceEnabled) => set({ voiceGuidanceEnabled }),
      setGuidedHand: (guidedHandActive, guidedStep = 0) => set({ guidedHandActive, guidedStep }),
      advanceGuidedStep: () => set((s) => ({ guidedStep: s.guidedStep + 1 })),
      dismissGuidedHand: () => set({ guidedHandActive: false, guidedStep: 0 }),
    }),
    {
      name: 'smb-ui-storage-v2',
      partialize: (s) => ({
        uiMode: s.uiMode,
        localeDisplay: s.localeDisplay,
        voiceGuidanceEnabled: s.voiceGuidanceEnabled,
      }),
      merge: (persistedState, currentState) => {
        const next = { ...currentState, ...persistedState }
        next.localeDisplay = normalizeLocaleMode(
          persistedState?.localeDisplay ?? currentState.localeDisplay
        )
        return next
      },
    }
  )
)

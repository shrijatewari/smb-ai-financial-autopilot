import { create } from 'zustand'

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  assistantOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
}))

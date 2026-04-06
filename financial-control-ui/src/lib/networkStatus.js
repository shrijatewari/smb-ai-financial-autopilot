import { useSyncExternalStore } from 'react'

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return typeof navigator !== 'undefined' && navigator.onLine
}

function getServerSnapshot() {
  return true
}

/** React hook: `true` when browser reports online. */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Non-hook boolean for modules without React. */
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

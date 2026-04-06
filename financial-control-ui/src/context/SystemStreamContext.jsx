import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchSystemState, getSystemStreamUrl } from '../services/api'

const SystemStreamContext = createContext(null)

/** @typedef {'live' | 'reconnecting' | 'idle'} StreamStatus */

/**
 * SSE subscription to GET /system/stream – replaces polling /system/state.
 * Children use `useSystemSnapshot()`.
 */
export function SystemStreamProvider({ children }) {
  const { token } = useAuth()
  const [snapshot, setSnapshot] = useState(null)
  const [streamStatus, setStreamStatus] = useState('idle')
  const [error, setError] = useState(null)
  const esRef = useRef(null)
  const reconnectRef = useRef(null)
  const backoffRef = useRef(1000)

  useEffect(() => {
    if (!token) {
      setSnapshot(null)
      setStreamStatus('idle')
      return
    }

    let cancelled = false

    const clearReconnect = () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }

    const closeEs = () => {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }

    const open = () => {
      if (cancelled) return
      clearReconnect()
      closeEs()
      const es = new EventSource(getSystemStreamUrl(token))
      esRef.current = es

      es.onopen = () => {
        if (cancelled) return
        backoffRef.current = 1000
        setStreamStatus('live')
      }

      es.onmessage = (ev) => {
        if (cancelled) return
        try {
          const data = JSON.parse(ev.data)
          setSnapshot(data)
          setError(null)
          setStreamStatus('live')
        } catch {
          setError('Invalid snapshot payload')
        }
      }

      es.onerror = () => {
        if (cancelled) return
        closeEs()
        setStreamStatus('reconnecting')
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, 30000)
        reconnectRef.current = window.setTimeout(() => {
          open()
        }, delay)
      }
    }

    fetchSystemState()
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data)
          setError(null)
          setStreamStatus('live')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load state')
      })

    open()

    return () => {
      cancelled = true
      clearReconnect()
      closeEs()
    }
  }, [token])

  /** If REST already returned a snapshot, do not show "Reconnecting" when SSE alone is retrying (common behind proxies). */
  const displayStreamStatus = useMemo(() => {
    if (snapshot != null && (streamStatus === 'reconnecting' || streamStatus === 'idle')) {
      return 'live'
    }
    return streamStatus
  }, [streamStatus, snapshot])

  const value = useMemo(
    () => ({
      snapshot,
      /** UI-safe: stays "live" while we have data even if EventSource is reconnecting. */
      streamStatus: displayStreamStatus,
      error,
      /** One-shot refresh (same as GET /system/state). */
      refreshSnapshot: async () => {
        const data = await fetchSystemState()
        setSnapshot(data)
        return data
      },
    }),
    [snapshot, displayStreamStatus, error]
  )

  return <SystemStreamContext.Provider value={value}>{children}</SystemStreamContext.Provider>
}

export function useSystemSnapshot() {
  const ctx = useContext(SystemStreamContext)
  if (!ctx) {
    throw new Error('useSystemSnapshot must be used within SystemStreamProvider')
  }
  return ctx
}

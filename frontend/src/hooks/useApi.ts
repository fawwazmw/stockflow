import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../api/client'

interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
}

/**
 * Small data-loading hook: keeps previous data visible while refetching so the
 * table does not flash on every keystroke, and exposes a retry function.
 */
export function useApi<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let active = true
    setState((prev) => ({ ...prev, loading: true, error: null }))

    loaderRef.current().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false })
      },
      (error: unknown) => {
        if (active) setState((prev) => ({ data: prev.data, error: toApiError(error), loading: false }))
      },
    )

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, refetch }
}

import { useEffect, useRef, useCallback } from 'react'

/**
 * 封装 Electron IPC 调用
 */
export function useIpc() {
  const api = window.electronAPI

  if (!api) {
    throw new Error('Electron API not available. Are you running in Electron?')
  }

  return api
}

/**
 * 注册 IPC 事件监听器，自动清理
 */
export function useIpcListener<T>(
  subscribe: (callback: (data: T) => void) => () => void,
  callback: (data: T) => void,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const unsubscribe = subscribe((data) => callbackRef.current(data))
    return unsubscribe
  }, [subscribe])
}

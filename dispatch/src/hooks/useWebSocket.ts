import { useEffect, useRef, useState } from 'react'

interface UseWebSocketOptions {
  enabled?: boolean
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const { enabled = false } = options
  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => setIsConnected(true)
    socket.onclose = () => setIsConnected(false)
    socket.onerror = () => setIsConnected(false)

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [enabled, url])

  return { socket: socketRef.current, isConnected }
}

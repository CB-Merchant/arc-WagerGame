import { useEffect, useRef, useState, useCallback } from 'react'
import type { Room } from '../../server/index'

export type { Room, GameType, GameState, TriviaState, RPSState, NumberGuessState, TicTacToeState } from '../../server/index'

type MessageHandler = (msg: Record<string, unknown>) => void

export function useGameServer(address: string | undefined) {
  const ws = useRef<WebSocket | null>(null)
  const handlers = useRef<Map<string, MessageHandler>>(new Map())
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`)
    ws.current = socket

    socket.onopen = () => {
      setConnected(true)
      if (address) socket.send(JSON.stringify({ type: 'register', address }))
    }

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>
        const handler = handlers.current.get(msg.type as string)
        if (handler) handler(msg)
        const wildcard = handlers.current.get('*')
        if (wildcard) wildcard(msg)
      } catch { /* ignore */ }
    }

    const onClose = () => {
      setConnected(false)
    }
    socket.onclose = onClose

    socket.onerror = () => socket.close()
  }, [address])

  useEffect(() => {
    connect()
    return () => { ws.current?.close() }
  }, [connect])

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
    }
  }, [])

  const on = useCallback((type: string, handler: MessageHandler) => {
    handlers.current.set(type, handler)
    return () => handlers.current.delete(type)
  }, [])

  return { send, on, connected }
}

export function useOpenRooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  useEffect(() => {
    fetch('/api/rooms').then(r => r.json()).then((d: { rooms: Room[] }) => setRooms(d.rooms)).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/rooms').then(r => r.json()).then((d: { rooms: Room[] }) => setRooms(d.rooms)).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [])
  return rooms
}

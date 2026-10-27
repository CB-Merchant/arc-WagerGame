import { useEffect, useRef, useState, useCallback } from 'react'
import Ably from 'ably'
import type { Room, GameType } from './useGameServer'

export type { Room, GameType }

type MessageHandler = (data: Record<string, unknown>) => void

// Singleton Ably client per session
let _client: Ably.Realtime | null = null
function getClient(clientId: string): Ably.Realtime {
  if (_client) return _client
  _client = new Ably.Realtime({
    authUrl: `/api/auth?clientId=${encodeURIComponent(clientId)}`,
    clientId,
  })
  return _client
}

export function useAblyGame(address: string | undefined) {
  const clientRef = useRef<Ably.Realtime | null>(null)
  const channelsRef = useRef<Map<string, Ably.RealtimeChannel>>(new Map())
  const handlersRef = useRef<Map<string, MessageHandler>>(new Map())
  const connectedRef = useRef(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!address) return
    const addr = address.toLowerCase()
    const client = getClient(addr)
    clientRef.current = client

    const onConnected = () => { connectedRef.current = true; setConnected(true) }
    const onDisconnected = () => { connectedRef.current = false; setConnected(false) }
    client.connection.on('connected', onConnected)
    client.connection.on('disconnected', onDisconnected)
    client.connection.on('failed', onDisconnected)

    // Sync initial state without direct setState in effect body
    const cur = client.connection.state
    if (cur === 'connected' && !connectedRef.current) {
      connectedRef.current = true
      setConnected(true)
    }
  }, [address])

  const subscribeToChannel = useCallback((channelName: string) => {
    if (!clientRef.current) return
    if (channelsRef.current.has(channelName)) return

    const channel = clientRef.current.channels.get(channelName)
    channelsRef.current.set(channelName, channel)

    void channel.subscribe((msg) => {
      const name = msg.name ?? ''
      const handler = handlersRef.current.get(name)
      if (handler) handler(msg.data as Record<string, unknown>)
      const wildcard = handlersRef.current.get('*')
      if (wildcard) wildcard({ type: name, ...(msg.data as Record<string, unknown>) })
    })
  }, [])

  const subscribeToRoom = useCallback((roomId: string) => {
    subscribeToChannel(`room:${roomId}`)
  }, [subscribeToChannel])

  const subscribeToPlayer = useCallback((addr: string) => {
    subscribeToChannel(`player:${addr.toLowerCase()}`)
  }, [subscribeToChannel])

  const on = useCallback((event: string, handler: MessageHandler) => {
    handlersRef.current.set(event, handler)
    return () => handlersRef.current.delete(event)
  }, [])

  const send = useCallback(async (msg: Record<string, unknown>) => {
    const { type, ...rest } = msg
    try {
      const endpoint = type === 'create_room' ? '/api/create-room'
        : type === 'player_joined' ? '/api/join-room'
        : type === 'matchmake' ? '/api/matchmake'
        : type === 'game_action' ? '/api/game-action'
        : null

      if (!endpoint) return

      const body = type === 'player_joined'
        ? { roomId: rest.roomId, address: rest.address }
        : rest

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      console.error('send error', e)
    }
  }, [])

  return { send, on, connected, subscribeToRoom, subscribeToPlayer }
}

export function useOnlinePlayersAbly(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    const guestId = `guest-${Math.random().toString(36).slice(2)}`
    const client = new Ably.Realtime({
      authUrl: `/api/auth?clientId=${encodeURIComponent(guestId)}`,
      clientId: guestId,
    })
    const channel = client.channels.get('online')

    const update = async () => {
      try {
        const members = await channel.presence.get()
        setCount(members.length)
      } catch { /* ignore */ }
    }

    void channel.presence.enter({})
    void channel.presence.subscribe(() => { void update() })
    void update()

    return () => {
      void channel.presence.leave()
      channel.presence.unsubscribe()
      client.close()
    }
  }, [])

  return count
}

export function useMatchmaking(
  address: string,
  gameType: GameType,
  wagerAmount: string,
  roomId: string,
  onMatchFound: (roomId: string, player1: string, player2: string) => void,
  enabled: boolean,
) {
  const { on, subscribeToPlayer } = useAblyGame(address)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const foundRef = useRef(false)

  useEffect(() => {
    if (!enabled || !address || foundRef.current) return

    subscribeToPlayer(address)

    const unsub = on('match_found', (data) => {
      if (foundRef.current) return
      foundRef.current = true
      if (pollingRef.current) clearInterval(pollingRef.current)
      onMatchFound(data.roomId as string, data.player1 as string, data.player2 as string)
    })

    const poll = async () => {
      if (foundRef.current) return
      try {
        const res = await fetch('/api/matchmake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, gameType, wagerAmount, roomId }),
        })
        const data = await res.json() as { matched: boolean; roomId?: string; player1?: string; player2?: string }
        if (data.matched && data.roomId && data.player1 && data.player2 && !foundRef.current) {
          foundRef.current = true
          if (pollingRef.current) clearInterval(pollingRef.current)
          onMatchFound(data.roomId, data.player1, data.player2)
        }
      } catch { /* ignore */ }
    }

    void poll()
    pollingRef.current = setInterval(() => { void poll() }, 3000)

    return () => {
      unsub()
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, address])
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store, initGameState, publishToRoom, publishToPlayer, type GameType } from './_gameLogic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const { address, gameType, wagerAmount, roomId } = req.body as {
    address: string; gameType: GameType; wagerAmount: string; roomId: string
  }
  const addr = address.toLowerCase()

  // Remove stale queue entries (older than 5 minutes)
  for (const [a, data] of store.getQueue()) {
    if (Date.now() - data.ts > 5 * 60 * 1000) store.removeFromQueue(a)
  }

  const matchAddr = store.findMatch(gameType, wagerAmount, addr)

  if (matchAddr) {
    // Match found — create the room
    const matchData = store.getQueue().find(([a]) => a === matchAddr)?.[1]
    if (!matchData) { res.status(500).json({ error: 'Match data missing' }); return }

    store.removeFromQueue(matchAddr)
    store.removeFromQueue(addr)

    const matchedRoomId = matchData.roomId ?? roomId
    const room = {
      roomId: matchedRoomId,
      player1: matchAddr,
      player2: addr,
      wagerAmount,
      gameType,
      isPrivate: false,
      status: 'ACTIVE' as const,
      winner: null,
      createdAt: Date.now(),
      gameState: initGameState(gameType, matchAddr, addr),
    }
    store.setRoom(matchedRoomId, room)

    const matchPayload = { type: 'match_found', roomId: matchedRoomId, player1: matchAddr, player2: addr, gameType, wagerAmount }
    await Promise.all([
      publishToPlayer(matchAddr, 'match_found', matchPayload),
      publishToPlayer(addr, 'match_found', matchPayload),
      publishToRoom(matchedRoomId, 'game_started', { room }),
    ])

    res.status(200).json({ matched: true, roomId: matchedRoomId, player1: matchAddr, player2: addr })
  } else {
    // Add to queue
    store.removeFromQueue(addr)
    store.addToQueue(addr, { gameType, wagerAmount, address: addr, roomId, ts: Date.now() } as { gameType: GameType; wagerAmount: string; address: string; roomId: string; ts: number })
    res.status(200).json({ matched: false, queued: true })
  }
}

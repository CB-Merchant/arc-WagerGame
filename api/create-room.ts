import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store, publishToRoom, type GameType } from './_gameLogic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const { roomId, address, gameType, wagerAmount, isPrivate } = req.body as {
    roomId: string; address: string; gameType: GameType; wagerAmount: string; isPrivate: boolean
  }

  if (store.getRoom(roomId)) { res.status(409).json({ error: 'Room already exists' }); return }

  const room = {
    roomId,
    player1: address.toLowerCase(),
    player2: null,
    wagerAmount,
    gameType,
    isPrivate,
    status: 'WAITING' as const,
    winner: null,
    createdAt: Date.now(),
    gameState: null,
  }
  store.setRoom(roomId, room)
  await publishToRoom(roomId, 'room_created', { room })
  res.status(200).json({ room })
}

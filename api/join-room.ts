import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store, initGameState, publishToRoom } from './_gameLogic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const { roomId, address } = req.body as { roomId: string; address: string }
  const room = store.getRoom(roomId)
  if (!room) { res.status(404).json({ error: 'Room not found' }); return }
  if (room.status !== 'WAITING') { res.status(409).json({ error: 'Room not waiting' }); return }
  if (room.player1 === address.toLowerCase()) { res.status(400).json({ error: 'Cannot join own room' }); return }

  room.player2 = address.toLowerCase()
  room.status = 'ACTIVE'
  room.gameState = initGameState(room.gameType, room.player1, room.player2)
  store.setRoom(roomId, room)

  await publishToRoom(roomId, 'game_started', { room })
  res.status(200).json({ room })
}

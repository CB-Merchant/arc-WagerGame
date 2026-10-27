import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store } from './_gameLogic'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  const openRooms = store.getAllRooms().filter(r => r.status === 'WAITING' && !r.isPrivate)
  res.status(200).json({ rooms: openRooms })
}

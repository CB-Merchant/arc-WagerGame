import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store } from './_gameLogic'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  const { id } = req.query
  if (!id || typeof id !== 'string') { res.status(400).json({ error: 'id required' }); return }

  const room = store.getRoom(id)
  if (!room) { res.status(404).json({ error: 'Not found' }); return }
  res.status(200).json({ room })
}

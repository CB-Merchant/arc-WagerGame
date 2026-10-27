import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms } from './_gameLogic';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { id } = req.query;
  const room = rooms.get(id as string);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.status(200).json({ room });
}

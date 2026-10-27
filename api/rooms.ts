import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms } from './_gameLogic';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const open = [...rooms.values()].filter(r => r.status === 'WAITING' && !r.isPrivate);
  res.status(200).json({ rooms: open });
}

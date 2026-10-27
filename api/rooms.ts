import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // In-memory rooms are per-function-instance on Vercel — matchmaking is handled via Ably
  res.status(200).json({ rooms: [] });
}

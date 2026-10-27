import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms } from './_gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomId, player2 } = req.body as { roomId: string; player2: string };
  if (!roomId || !player2) return res.status(400).json({ error: 'Missing required fields' });

  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'WAITING') return res.status(400).json({ error: 'Room not available' });
  if (room.player1.toLowerCase() === player2.toLowerCase()) return res.status(400).json({ error: 'Cannot join your own room' });

  room.player2 = player2;
  room.status = 'ACTIVE';
  room.activeAt = Date.now();

  const apiKey = process.env.ABLY_API_KEY;
  if (apiKey) {
    const ably = new Ably.Rest(apiKey);
    const channel = ably.channels.get(`room:${roomId}`);
    await channel.publish('player_joined', { room });
  }

  res.status(200).json({ room });
}

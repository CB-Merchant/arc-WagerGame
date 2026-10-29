import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = (req.query.id ?? req.query.roomId) as string | undefined;
  if (!id) return res.status(400).json({ error: 'Missing room id' });

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Ably not configured' });

  try {
    const ably = new Ably.Rest(apiKey);

    // Check the room-specific channel history first
    const roomChannel = ably.channels.get(`room:${id}`);
    const roomPage = await roomChannel.history({ limit: 50, direction: 'backwards' });
    for (const msg of roomPage.items) {
      if (msg.name === 'room_created' || msg.name === 'player_joined') {
        const data = msg.data as { room: unknown };
        return res.status(200).json({ room: data.room, roomId: id });
      }
    }

    // Fallback: check the lookup channel for this roomId
    const lookupChannel = ably.channels.get('room-lookup');
    const lookupPage = await lookupChannel.history({ limit: 100, direction: 'backwards' });
    for (const msg of lookupPage.items) {
      if (msg.name === id) {
        const data = msg.data as { room: unknown };
        return res.status(200).json({ room: data.room, roomId: id });
      }
    }

    return res.status(200).json({ room: null, roomId: id });
  } catch (err) {
    console.error('Error fetching room:', err);
    return res.status(500).json({ error: 'Failed to retrieve room' });
  }
}

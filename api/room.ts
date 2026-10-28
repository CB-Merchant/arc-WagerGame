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
    const channel = ably.channels.get(`room:${id}`);

    // Retrieve the last room_created message from channel history
    const page = await channel.history({ limit: 50, direction: 'backwards' });
    const messages = page.items;

    for (const msg of messages) {
      if (msg.name === 'room_created') {
        const data = msg.data as { room: unknown };
        return res.status(200).json({ room: data.room, roomId: id });
      }
      if (msg.name === 'player_joined') {
        // room state was updated — use this as most recent
        const data = msg.data as { room: unknown };
        return res.status(200).json({ room: data.room, roomId: id });
      }
    }

    // No history found — room may be too old or not created yet
    return res.status(200).json({ room: null, roomId: id });
  } catch (err) {
    console.error('Error fetching room from Ably:', err);
    return res.status(500).json({ error: 'Failed to retrieve room' });
  }
}

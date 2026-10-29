import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = (req.query.id ?? req.query.roomId) as string | undefined;
  if (!id) return res.status(400).json({ error: 'Missing room id' });

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return res.status(200).json({ room: null, roomId: id });

  try {
    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest(apiKey);

    // If the id looks like a 4-digit PIN, resolve it via the pin-lookup channel
    if (/^\d{4}$/.test(id)) {
      const pinChannel = ably.channels.get('pin-lookup');
      const pinPage = await pinChannel.history({ limit: 100, direction: 'backwards' });
      for (const msg of pinPage.items) {
        if (msg.name === id) {
          const data = msg.data as { room: { id: string } };
          return res.status(200).json({ room: data.room, roomId: data.room.id });
        }
      }
      return res.status(200).json({ room: null, roomId: id, error: 'PIN not found or expired' });
    }

    // Check room-specific channel history by full roomId
    const roomChannel = ably.channels.get(`room:${id}`);
    const roomPage = await roomChannel.history({ limit: 50, direction: 'backwards' });
    for (const msg of roomPage.items) {
      if (msg.name === 'room_created' || msg.name === 'player_joined') {
        const data = msg.data as { room: unknown };
        return res.status(200).json({ room: data.room, roomId: id });
      }
    }

    // Fallback: lookup channel
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
    const message = err instanceof Error ? err.message : String(err);
    console.error('room lookup error:', message);
    return res.status(200).json({ room: null, roomId: id, error: message });
  }
}

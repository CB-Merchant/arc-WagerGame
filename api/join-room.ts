import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { roomId, player2 } = req.body as { roomId: string; player2: string };
    if (!roomId || !player2) return res.status(400).json({ error: 'Missing required fields' });

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) return res.status(200).json({ status: 'ok' });

    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest(apiKey);

    // Publish player_joined to the room channel so player1 knows opponent joined
    await ably.channels.get(`room:${roomId}`).publish('player_joined', {
      room: { player2, status: 'ACTIVE', roomId }
    });

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('join-room error:', msg);
    return res.status(500).json({ error: msg });
  }
}

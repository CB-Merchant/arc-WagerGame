import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Ably not configured' });

  try {
    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest(apiKey);

    if (req.method === 'POST') {
      const { playerId, gameType, wagerAmount } = req.body as {
        playerId: string; gameType: string; wagerAmount: string;
      };
      if (!playerId || !gameType || !wagerAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const queueChannelName = `queue:${gameType}:${wagerAmount}`;
      const queueChannel = ably.channels.get(queueChannelName);

      // Check history for a waiting player (published in last 5 minutes)
      const page = await queueChannel.history({ limit: 50, direction: 'backwards' });
      const waiting = (page.items as { name: string; data: { playerId: string; queuedAt: number } }[])
        .filter(m =>
          m.name === 'queued' &&
          m.data.playerId !== playerId &&
          Date.now() - m.data.queuedAt < 5 * 60 * 1000 // within 5 minutes
        );

      if (waiting.length > 0) {
        // Match with the most recent waiting player
        const opponent = waiting[0].data.playerId;
        const roomId = `0x${Date.now().toString(16)}${Math.floor(Math.random() * 0xffffff).toString(16)}`.padEnd(66, '0').slice(0, 66);

        // Publish dequeue event so this opponent won't be matched again
        await queueChannel.publish('dequeued', { playerId: opponent });

        // Notify both players on their personal channels
        await ably.channels.get(`player:${playerId}`).publish('matched', {
          roomId, role: 'player2', opponent
        });
        await ably.channels.get(`player:${opponent}`).publish('matched', {
          roomId, role: 'player1', opponent: playerId
        });

        return res.status(200).json({ status: 'matched', roomId, role: 'player2', opponent });
      }

      // No match found — add this player to the queue via Ably history
      await queueChannel.publish('queued', { playerId, gameType, wagerAmount, queuedAt: Date.now() });

      return res.status(200).json({ status: 'queued' });
    }

    if (req.method === 'DELETE') {
      const { playerId, gameType, wagerAmount } = req.body as {
        playerId: string; gameType: string; wagerAmount: string;
      };
      if (playerId && gameType && wagerAmount) {
        const queueChannel = ably.channels.get(`queue:${gameType}:${wagerAmount}`);
        await queueChannel.publish('dequeued', { playerId });
      }
      return res.status(200).json({ status: 'cancelled' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('matchmake error:', msg);
    return res.status(500).json({ error: msg });
  }
}

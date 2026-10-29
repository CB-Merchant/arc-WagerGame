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

      // Check Ably presence on the matchmaking channel for waiting players
      const queueChannel = ably.channels.get(`matchmaking:${gameType}:${wagerAmount}`);
      const presenceResult = await queueChannel.presence.get();
      // REST presence.get() returns a PaginatedResult — get the items array
      const members = Array.isArray(presenceResult) ? presenceResult
        : (presenceResult as { items?: unknown[] }).items ?? [];
      const others = (members as { clientId: string }[]).filter(m => m.clientId !== playerId);

      if (others.length > 0) {
        // Match with the first waiting player
        const opponent = others[0];
        const roomId = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(0, 66);

        // Notify both players
        await ably.channels.get(`player:${playerId}`).publish('matched', {
          roomId, role: 'player1', opponent: opponent.clientId
        });
        await ably.channels.get(`player:${opponent.clientId}`).publish('matched', {
          roomId, role: 'player2', opponent: playerId
        });

        return res.status(200).json({ status: 'matched', roomId, role: 'player1' });
      }

      return res.status(200).json({ status: 'queued' });
    }

    if (req.method === 'DELETE') {
      return res.status(200).json({ status: 'cancelled' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('matchmake error:', msg);
    return res.status(500).json({ error: msg });
  }
}

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

      // 1. Check if this player was already matched (stored in their personal match channel)
      const myMatchChannel = ably.channels.get(`match-result:${playerId}`);
      const myHistory = await myMatchChannel.history({ limit: 5, direction: 'backwards' });
      const myMatch = (myHistory.items as { name: string; data: { roomId: string; role: string; opponent: string; matchedAt: number } }[])
        .find(m => m.name === 'matched' && Date.now() - m.data.matchedAt < 10 * 60 * 1000);

      if (myMatch) {
        // Already matched — return the stored result
        return res.status(200).json({
          status: 'matched',
          roomId: myMatch.data.roomId,
          role: myMatch.data.role,
          opponent: myMatch.data.opponent,
        });
      }

      const queueChannelName = `queue:${gameType}:${wagerAmount}`;
      const queueChannel = ably.channels.get(queueChannelName);

      // 2. Check queue history for a waiting opponent
      const page = await queueChannel.history({ limit: 100, direction: 'backwards' });
      const allMessages = page.items as { name: string; data: { playerId: string; queuedAt: number } }[];

      // Build set of dequeued players
      const dequeued = new Set(
        allMessages.filter(m => m.name === 'dequeued').map(m => m.data.playerId)
      );

      // Find a valid waiting player that is not us and not dequeued
      const waiting = allMessages.find(m =>
        m.name === 'queued' &&
        m.data.playerId !== playerId &&
        !dequeued.has(m.data.playerId) &&
        Date.now() - m.data.queuedAt < 10 * 60 * 1000
      );

      if (waiting) {
        const opponent = waiting.data.playerId;
        const roomId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 66).padEnd(66, '0');
        const matchedAt = Date.now();

        // Dequeue the opponent
        await queueChannel.publish('dequeued', { playerId: opponent });
        // Dequeue ourselves too
        await queueChannel.publish('dequeued', { playerId });

        // Store match result for BOTH players in their personal match channels
        // so any poll can find it
        await ably.channels.get(`match-result:${playerId}`).publish('matched', {
          roomId, role: 'player2', opponent, matchedAt
        });
        await ably.channels.get(`match-result:${opponent}`).publish('matched', {
          roomId, role: 'player1', opponent: playerId, matchedAt
        });

        // Also push via Realtime for instant notification (best-effort)
        void ably.channels.get(`player:${playerId}`).publish('matched', { roomId, role: 'player2', opponent });
        void ably.channels.get(`player:${opponent}`).publish('matched', { roomId, role: 'player1', opponent: playerId });

        return res.status(200).json({ status: 'matched', roomId, role: 'player2', opponent });
      }

      // 3. No match — add to queue
      await queueChannel.publish('queued', { playerId, gameType, wagerAmount, queuedAt: Date.now() });
      return res.status(200).json({ status: 'queued' });
    }

    if (req.method === 'DELETE') {
      const { playerId, gameType, wagerAmount } = req.body as {
        playerId: string; gameType: string; wagerAmount: string;
      };
      if (playerId && gameType && wagerAmount) {
        await ably.channels.get(`queue:${gameType}:${wagerAmount}`).publish('dequeued', { playerId });
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

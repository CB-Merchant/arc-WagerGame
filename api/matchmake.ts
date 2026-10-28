import type { VercelRequest, VercelResponse } from '@vercel/node';
import Ably from 'ably';

const ably = new Ably.Rest(process.env.ABLY_API_KEY ?? '');

/**
 * Matchmaking using Ably presence on the matchmaking channel as the queue.
 * Each player enters presence on `matchmaking:<gameType>:<wagerAmount>`.
 * When 2+ players are present, the first two are matched.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const { playerId, gameType, wagerAmount } = req.body as {
      playerId: string;
      gameType: string;
      wagerAmount: string;
    };

    if (!playerId || !gameType || !wagerAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const queueChannel = `matchmaking:${gameType}:${wagerAmount}`;
    const channel = ably.channels.get(queueChannel);

    // Get current presence members (other waiting players)
    const members = await channel.presence.get();
    const others = members.filter(
      (m) => (m.clientId ?? '') !== playerId
    );

    if (others.length > 0) {
      // Match with the first waiting player
      const opponent = others[0];
      const opponentId = opponent.clientId ?? '';
      const roomId = `${gameType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Publish match found to both players
      await ably.channels.get(`player:${playerId}`).publish('matched', {
        roomId,
        role: 'player2',
        opponentId,
      });
      await ably.channels.get(`player:${opponentId}`).publish('matched', {
        roomId,
        role: 'player1',
        opponentId: playerId,
      });

      // Publish room_created to the room channel
      await ably.channels.get(`room:${roomId}`).publish('player_joined', {
        room: {
          roomId,
          player1: opponentId,
          player2: playerId,
          status: 'ACTIVE',
          gameState: null,
        },
      });

      res.status(200).json({ status: 'matched', roomId, role: 'player2' });
    } else {
      // No opponent yet — publish to player's own channel to confirm queued
      await ably.channels.get(`player:${playerId}`).publish('queued', {
        gameType,
        wagerAmount,
        queueChannel,
      });

      res.status(200).json({ status: 'queued', queueChannel });
    }
    return;
  }

  if (req.method === 'DELETE') {
    // Player cancelled — nothing to do server-side (presence leaves via client)
    res.status(200).json({ status: 'cancelled' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

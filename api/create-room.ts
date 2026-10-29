import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRoomId, initGameState } from './_gameLogic';
import type { GameType } from './_gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { gameType, wagerAmount, isPrivate, player1, onChainRoomId } = req.body as {
      gameType: GameType;
      wagerAmount: string;
      isPrivate: boolean;
      player1: string;
      onChainRoomId: string;
    };

    if (!gameType || !wagerAmount || !player1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const roomId = onChainRoomId || generateRoomId();
    const room = {
      id: roomId,
      gameType,
      wagerAmount,
      isPrivate: !!isPrivate,
      player1,
      player2: null as string | null,
      status: 'WAITING' as const,
      createdAt: Date.now(),
      gameState: initGameState(gameType),
    };

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      // Still return success — room is on-chain, Ably is optional
      return res.status(200).json({ roomId, room });
    }

    // Lazy import Ably to avoid any top-level module issues
    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest(apiKey);

    const channel = ably.channels.get(`room:${roomId}`);
    await channel.publish('room_created', { room });

    // Also publish to lookup channel for /api/room retrieval
    const lookupChannel = ably.channels.get('room-lookup');
    await lookupChannel.publish(roomId, { room });

    return res.status(200).json({ roomId, room });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-room error:', message);
    return res.status(500).json({ error: message });
  }
}

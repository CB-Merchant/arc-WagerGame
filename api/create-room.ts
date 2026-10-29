import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRoomId, initGameState } from './_gameLogic';
import type { GameType } from './_gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  if (!apiKey) return res.status(500).json({ error: 'Ably not configured' });

  try {
    const ably = new Ably.Rest(apiKey);
    const channel = ably.channels.get(`room:${roomId}`);
    // Publish room_created — Ably stores last 2 min of messages in history on paid plans.
    // On free plan we use a separate lookup channel as a persistent key-value store.
    await channel.publish('room_created', { room });

    // Also publish to a lookup channel keyed by roomId so /api/room can find it
    // even if the room channel history has expired
    const lookupChannel = ably.channels.get('room-lookup');
    await lookupChannel.publish(roomId, { room });
  } catch (err) {
    console.error('Ably publish error:', err);
    // Don't fail the whole request — room was created on-chain
  }

  res.status(200).json({ roomId, room });
}

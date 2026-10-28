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

  const ably = new Ably.Rest(apiKey);
  // Enable channel history so /api/room can retrieve room data later
  const channel = ably.channels.get(`room:${roomId}`, { params: { persist: 'true' } });

  // Publish room_created — this message is stored in Ably channel history (2min retention on free plan)
  // and retrieved by /api/room when player2 looks up the room
  await channel.publish('room_created', { room });

  res.status(200).json({ roomId, room });
}

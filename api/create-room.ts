import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms, generateRoomId, initGameState } from './_gameLogic';
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
    player2: null,
    status: 'WAITING' as const,
    createdAt: Date.now(),
    gameState: initGameState(gameType),
  };

  rooms.set(roomId, room);

  const apiKey = process.env.ABLY_API_KEY;
  if (apiKey) {
    const ably = new Ably.Rest(apiKey);
    const channel = ably.channels.get(`room:${roomId}`);
    await channel.publish('room_created', { room });
  }

  res.status(200).json({ roomId, room });
}

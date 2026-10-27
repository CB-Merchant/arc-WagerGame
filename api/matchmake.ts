import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms, matchmakingQueue, initGameState, generateRoomId } from './_gameLogic';
import type { GameType } from './_gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, gameType, wagerAmount } = req.body as {
    playerId: string;
    gameType: GameType;
    wagerAmount: string;
  };

  if (!playerId || !gameType || !wagerAmount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const queueKey = `${gameType}:${wagerAmount}`;

  // Check for existing player in queue
  const existing = matchmakingQueue.get(queueKey);
  if (existing && existing.playerId !== playerId) {
    // Match found
    matchmakingQueue.delete(queueKey);
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      gameType,
      wagerAmount,
      isPrivate: false,
      player1: existing.playerId,
      player2: playerId,
      status: 'ACTIVE' as const,
      createdAt: existing.queuedAt,
      activeAt: Date.now(),
      gameState: initGameState(gameType),
    };
    rooms.set(roomId, room);

    const apiKey = process.env.ABLY_API_KEY;
    if (apiKey) {
      const ably = new Ably.Rest(apiKey);
      // Notify both players
      await ably.channels.get(`player:${existing.playerId}`).publish('matched', { roomId, room, role: 'player1' });
      await ably.channels.get(`player:${playerId}`).publish('matched', { roomId, room, role: 'player2' });
    }

    return res.status(200).json({ status: 'matched', roomId, room, role: 'player2' });
  }

  // Add to queue
  matchmakingQueue.set(queueKey, { playerId, wagerAmount, queuedAt: Date.now() });
  res.status(200).json({ status: 'queued', queueKey });
}

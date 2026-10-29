import type { VercelRequest, VercelResponse } from '@vercel/node';

type GameType = 'TRIVIA' | 'RPS' | 'NUMBER_GUESS' | 'TICTACTOE';

function initGameState(gameType: GameType) {
  switch (gameType) {
    case 'TRIVIA': return { questionIndex: 0, scores: { p1: 0, p2: 0 }, phase: 'question', answered: { p1: false, p2: false } };
    case 'RPS': return { round: 1, maxRounds: 5, scores: { p1: 0, p2: 0 }, moves: { p1: null, p2: null } };
    case 'NUMBER_GUESS': return { target: Math.floor(Math.random() * 100) + 1, guesses: { p1: null, p2: null }, phase: 'guess' };
    case 'TICTACTOE': return { board: Array(9).fill(null), currentTurn: 'p1', winner: null };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body as Record<string, unknown>;
    const gameType = body.gameType as GameType;
    const wagerAmount = body.wagerAmount as string;
    const isPrivate = !!body.isPrivate;
    const player1 = body.player1 as string;
    const roomId = (body.onChainRoomId as string) || Math.random().toString(36).slice(2);

    if (!gameType || !wagerAmount || !player1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const room = {
      id: roomId,
      gameType,
      wagerAmount,
      isPrivate,
      player1,
      player2: null,
      status: 'WAITING',
      createdAt: Date.now(),
      gameState: initGameState(gameType),
    };

    const apiKey = process.env.ABLY_API_KEY;
    if (apiKey) {
      try {
        const Ably = (await import('ably')).default;
        const ably = new Ably.Rest(apiKey);
        await ably.channels.get(`room:${roomId}`).publish('room_created', { room });
        await ably.channels.get('room-lookup').publish(roomId, { room });
      } catch (ablyErr) {
        console.error('Ably error (non-fatal):', ablyErr);
      }
    }

    return res.status(200).json({ roomId, room });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('create-room fatal:', msg);
    return res.status(500).json({ error: msg });
  }
}

import Ably from 'ably';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rooms, TRIVIA_QUESTIONS } from './_gameLogic';

function checkTicTacToeWinner(board: (string | null)[]): string | null {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomId, playerId, action, payload } = req.body as {
    roomId: string;
    playerId: string;
    action: string;
    payload: Record<string, unknown>;
  };

  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'ACTIVE') return res.status(400).json({ error: 'Room not active' });

  const role = room.player1.toLowerCase() === playerId.toLowerCase() ? 'p1'
    : room.player2?.toLowerCase() === playerId.toLowerCase() ? 'p2' : null;
  if (!role) return res.status(403).json({ error: 'Not a player in this room' });

  const gs = room.gameState as Record<string, unknown>;
  let event = 'game_state';
  let winner: string | null = null;

  if (room.gameType === 'TRIVIA' && action === 'answer') {
    const answered = gs.answered as Record<string, boolean>;
    const scores = gs.scores as Record<string, number>;
    answered[role] = true;
    const q = TRIVIA_QUESTIONS[(gs.questionIndex as number)];
    if (payload.answer === q.answer) scores[role]++;
    if (answered.p1 && answered.p2) {
      const qi = (gs.questionIndex as number) + 1;
      if (qi >= TRIVIA_QUESTIONS.length) {
        room.status = 'FINISHED';
        winner = scores.p1 > scores.p2 ? room.player1 : scores.p2 > scores.p1 ? (room.player2 ?? null) : null;
        event = 'game_over';
      } else {
        gs.questionIndex = qi;
        gs.answered = { p1: false, p2: false };
      }
    }
  } else if (room.gameType === 'RPS' && action === 'move') {
    const moves = gs.moves as Record<string, unknown>;
    moves[role] = payload.move;
    if (moves.p1 && moves.p2) {
      const scores = gs.scores as Record<string, number>;
      const rpsWin: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
      if (moves.p1 !== moves.p2) {
        if (rpsWin[moves.p1 as string] === moves.p2) scores.p1++; else scores.p2++;
      }
      const round = (gs.round as number) + 1;
      if (round > (gs.maxRounds as number) || scores.p1 > 2 || scores.p2 > 2) {
        room.status = 'FINISHED';
        winner = scores.p1 > scores.p2 ? room.player1 : (room.player2 ?? null);
        event = 'game_over';
      } else {
        gs.round = round;
        gs.moves = { p1: null, p2: null };
      }
    }
  } else if (room.gameType === 'NUMBER_GUESS' && action === 'guess') {
    const guesses = gs.guesses as Record<string, unknown>;
    guesses[role] = payload.guess;
    if (guesses.p1 !== null && guesses.p2 !== null) {
      const target = gs.target as number;
      const d1 = Math.abs((guesses.p1 as number) - target);
      const d2 = Math.abs((guesses.p2 as number) - target);
      room.status = 'FINISHED';
      winner = d1 < d2 ? room.player1 : (room.player2 ?? null);
      event = 'game_over';
    }
  } else if (room.gameType === 'TICTACTOE' && action === 'move') {
    const board = gs.board as (string | null)[];
    const idx = payload.index as number;
    if (board[idx] === null && gs.currentTurn === role) {
      board[idx] = role;
      const tttWinner = checkTicTacToeWinner(board);
      const isDraw = !tttWinner && board.every(c => c !== null);
      if (tttWinner || isDraw) {
        room.status = 'FINISHED';
        winner = tttWinner === 'p1' ? room.player1 : tttWinner === 'p2' ? (room.player2 ?? null) : null;
        event = 'game_over';
      } else {
        gs.currentTurn = role === 'p1' ? 'p2' : 'p1';
      }
    }
  }

  const apiKey = process.env.ABLY_API_KEY;
  if (apiKey) {
    const ably = new Ably.Rest(apiKey);
    const channel = ably.channels.get(`room:${roomId}`);
    await channel.publish(event, { gameState: room.gameState, winner, status: room.status });
  }

  res.status(200).json({ gameState: room.gameState, winner, status: room.status });
}

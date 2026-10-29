import type { VercelRequest, VercelResponse } from '@vercel/node';

const TRIVIA_QUESTIONS = [
  { q: 'What is the native gas token on Arc?', options: ['ETH', 'USDC', 'ARC', 'MATIC'], answer: 1 },
  { q: 'What does USDC stand for?', options: ['Universal Standard Digital Currency', 'US Dollar Coin', 'USD Coin', 'United States Digital Cash'], answer: 2 },
  { q: 'What company issues USDC?', options: ['Coinbase', 'Circle', 'Binance', 'Tether'], answer: 1 },
  { q: 'What is the ERC standard for fungible tokens?', options: ['ERC-721', 'ERC-1155', 'ERC-20', 'ERC-4337'], answer: 2 },
  { q: 'What does CCTP stand for?', options: ['Cross-Chain Transfer Protocol', 'Crypto Coin Transfer Program', 'Circle Cross Transfer Process', 'Chain Currency Transfer Protocol'], answer: 0 },
];

function checkTicTacToeWinner(board: (string | null)[]): string | null {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { roomId, playerId, action, payload } = req.body as {
      roomId: string; playerId: string; action: string; payload: Record<string, unknown>;
    };

    // Game state is managed via Ably channel history — retrieve current state
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Ably not configured' });

    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest(apiKey);
    const roomChannel = ably.channels.get(`room:${roomId}`);

    // Get current room state from channel history
    const page = await roomChannel.history({ limit: 50, direction: 'backwards' });
    let room: Record<string, unknown> | null = null;
    for (const msg of page.items) {
      if (msg.name === 'room_created' || msg.name === 'player_joined' || msg.name === 'game_state' || msg.name === 'game_over') {
        room = (msg.data as { room?: Record<string, unknown> }).room ?? (msg.data as Record<string, unknown>);
        break;
      }
    }

    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player1 = room.player1 as string;
    const player2 = room.player2 as string | null;
    const gameType = room.gameType as string;
    const gs = (room.gameState ?? {}) as Record<string, unknown>;

    const role = player1.toLowerCase() === playerId.toLowerCase() ? 'p1'
      : player2?.toLowerCase() === playerId.toLowerCase() ? 'p2' : null;
    if (!role) return res.status(403).json({ error: 'Not a player in this room' });

    let event = 'game_state';
    let winner: string | null = null;
    let status = 'ACTIVE';

    if (gameType === 'TRIVIA' && action === 'answer') {
      const answered = gs.answered as Record<string, boolean>;
      const scores = gs.scores as Record<string, number>;
      answered[role] = true;
      const q = TRIVIA_QUESTIONS[gs.questionIndex as number];
      if (payload.answer === q.answer) scores[role]++;
      if (answered.p1 && answered.p2) {
        const qi = (gs.questionIndex as number) + 1;
        if (qi >= TRIVIA_QUESTIONS.length) {
          status = 'FINISHED';
          winner = scores.p1 > scores.p2 ? player1 : scores.p2 > scores.p1 ? (player2 ?? null) : null;
          event = 'game_over';
        } else { gs.questionIndex = qi; gs.answered = { p1: false, p2: false }; }
      }
    } else if (gameType === 'RPS' && action === 'move') {
      const moves = gs.moves as Record<string, unknown>;
      moves[role] = payload.move;
      if (moves.p1 && moves.p2) {
        const scores = gs.scores as Record<string, number>;
        const rpsWin: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
        if (moves.p1 !== moves.p2) { if (rpsWin[moves.p1 as string] === moves.p2) scores.p1++; else scores.p2++; }
        const round = (gs.round as number) + 1;
        if (round > (gs.maxRounds as number) || scores.p1 > 2 || scores.p2 > 2) {
          status = 'FINISHED'; winner = scores.p1 > scores.p2 ? player1 : (player2 ?? null); event = 'game_over';
        } else { gs.round = round; gs.moves = { p1: null, p2: null }; }
      }
    } else if (gameType === 'NUMBER_GUESS' && action === 'guess') {
      const guesses = gs.guesses as Record<string, unknown>;
      guesses[role] = payload.guess;
      if (guesses.p1 !== null && guesses.p2 !== null) {
        const target = gs.target as number;
        const d1 = Math.abs((guesses.p1 as number) - target);
        const d2 = Math.abs((guesses.p2 as number) - target);
        status = 'FINISHED'; winner = d1 < d2 ? player1 : (player2 ?? null); event = 'game_over';
      }
    } else if (gameType === 'TICTACTOE' && action === 'move') {
      const board = gs.board as (string | null)[];
      const idx = payload.index as number;
      if (board[idx] === null && gs.currentTurn === role) {
        board[idx] = role;
        const tttWinner = checkTicTacToeWinner(board);
        const isDraw = !tttWinner && board.every(c => c !== null);
        if (tttWinner || isDraw) {
          status = 'FINISHED';
          winner = tttWinner === 'p1' ? player1 : tttWinner === 'p2' ? (player2 ?? null) : null;
          event = 'game_over';
        } else { gs.currentTurn = role === 'p1' ? 'p2' : 'p1'; }
      }
    }

    const updatedRoom = { ...room, gameState: gs, status, winner };
    await roomChannel.publish(event, { room: updatedRoom, gameState: gs, winner, status });

    return res.status(200).json({ gameState: gs, winner, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('game-action error:', msg);
    return res.status(500).json({ error: msg });
  }
}

// Shared game logic for all Vercel API routes

export type GameType = 'TRIVIA' | 'RPS' | 'NUMBER_GUESS' | 'TICTACTOE';

export interface Room {
  id: string;
  gameType: GameType;
  wagerAmount: string;
  isPrivate: boolean;
  player1: string;
  player2: string | null;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  createdAt: number;
  activeAt?: number;
  gameState: unknown;
}

// In-memory store (resets on cold start — acceptable for testnet)
export const rooms = new Map<string, Room>();
export const matchmakingQueue = new Map<string, { playerId: string; wagerAmount: string; queuedAt: number }>();

export const TRIVIA_QUESTIONS = [
  { q: 'What is the native gas token on Arc?', options: ['ETH', 'USDC', 'ARC', 'MATIC'], answer: 1 },
  { q: 'What does USDC stand for?', options: ['Universal Standard Digital Currency', 'US Dollar Coin', 'USD Coin', 'United States Digital Cash'], answer: 2 },
  { q: 'What company issues USDC?', options: ['Coinbase', 'Circle', 'Binance', 'Tether'], answer: 1 },
  { q: 'What is the ERC standard for fungible tokens?', options: ['ERC-721', 'ERC-1155', 'ERC-20', 'ERC-4337'], answer: 2 },
  { q: 'What does CCTP stand for?', options: ['Cross-Chain Transfer Protocol', 'Crypto Coin Transfer Program', 'Circle Cross Transfer Process', 'Chain Currency Transfer Protocol'], answer: 0 },
];

export function generateRoomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function initGameState(gameType: GameType) {
  switch (gameType) {
    case 'TRIVIA':
      return { questionIndex: 0, scores: { p1: 0, p2: 0 }, phase: 'question', answered: { p1: false, p2: false } };
    case 'RPS':
      return { round: 1, maxRounds: 5, scores: { p1: 0, p2: 0 }, moves: { p1: null, p2: null } };
    case 'NUMBER_GUESS':
      return { target: Math.floor(Math.random() * 100) + 1, guesses: { p1: null, p2: null }, phase: 'guess' };
    case 'TICTACTOE':
      return { board: Array(9).fill(null), currentTurn: 'p1', winner: null };
  }
}

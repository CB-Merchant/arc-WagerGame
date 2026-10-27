// Shared game logic for Vercel API routes
import Ably from 'ably'

export type GameType = 'TRIVIA' | 'RPS' | 'NUMBER_GUESS' | 'TICTACTOE'
export type RoomStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED'

export interface Room {
  roomId: string
  player1: string
  player2: string | null
  wagerAmount: string
  gameType: GameType
  isPrivate: boolean
  status: RoomStatus
  winner: string | null
  createdAt: number
  gameState: GameState | null
}

export type GameState = TriviaState | RPSState | NumberGuessState | TicTacToeState

export interface TriviaState {
  type: 'TRIVIA'
  currentQuestion: number
  questions: TriviaQuestion[]
  scores: Record<string, number>
  answered: Record<string, number | null>
  roundComplete: boolean
}

export interface TriviaQuestion {
  question: string
  options: string[]
  correct: number
}

export interface RPSState {
  type: 'RPS'
  round: number
  maxRounds: number
  scores: Record<string, number>
  choices: Record<string, 'rock' | 'paper' | 'scissors' | null>
  roundResult: string | null
}

export interface NumberGuessState {
  type: 'NUMBER_GUESS'
  round: number
  maxRounds: number
  targetNumber: number
  guesses: Record<string, number | null>
  scores: Record<string, number>
  revealed: boolean
}

export interface TicTacToeState {
  type: 'TICTACTOE'
  board: (string | null)[]
  currentTurn: string
  scores: Record<string, number>
  moveCount: number
}

const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { question: 'What is the native gas token of Arc?', options: ['ETH', 'USDC', 'ARC', 'BTC'], correct: 1 },
  { question: 'What company created Circle USDC?', options: ['Coinbase', 'Tether', 'Circle', 'Binance'], correct: 2 },
  { question: 'How many decimals does USDC have on Arc?', options: ['18', '8', '6', '2'], correct: 2 },
  { question: 'What does ERC stand for in ERC-20?', options: ['Ethereum Request for Comment', 'Ethereum Runtime Code', 'Encrypted Resource Contract', 'Extended Runtime Control'], correct: 0 },
  { question: 'What is a smart contract?', options: ['A legal document', 'Self-executing code on blockchain', 'A bank contract', 'A wallet password'], correct: 1 },
  { question: 'What is gas in Ethereum?', options: ['Natural gas', 'Fee for computation', 'Token type', 'Exchange rate'], correct: 1 },
  { question: 'CCTP stands for?', options: ['Cross-Chain Transfer Protocol', 'Circle Core Transfer Program', 'Crypto Chain Transaction Protocol', 'Centralized Crypto Transfer Platform'], correct: 0 },
  { question: 'What consensus mechanism does Arc use?', options: ['Proof of Work', 'Proof of Stake', 'Proof of Authority', 'Delegated Proof of Stake'], correct: 1 },
  { question: 'In blockchain, what is a block?', options: ['A type of coin', 'A group of validated transactions', 'A wallet type', 'A mining algorithm'], correct: 1 },
  { question: 'What does DeFi stand for?', options: ['Decentralized Finance', 'Digital Finance', 'Distributed Finance', 'Decoupled Finance'], correct: 0 },
]

export function initGameState(gameType: GameType, player1: string, player2: string): GameState {
  if (gameType === 'TRIVIA') {
    const shuffled = [...TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 5)
    return { type: 'TRIVIA', currentQuestion: 0, questions: shuffled, scores: { [player1]: 0, [player2]: 0 }, answered: { [player1]: null, [player2]: null }, roundComplete: false }
  }
  if (gameType === 'RPS') {
    return { type: 'RPS', round: 1, maxRounds: 5, scores: { [player1]: 0, [player2]: 0 }, choices: { [player1]: null, [player2]: null }, roundResult: null }
  }
  if (gameType === 'NUMBER_GUESS') {
    return { type: 'NUMBER_GUESS', round: 1, maxRounds: 5, targetNumber: Math.floor(Math.random() * 100) + 1, guesses: { [player1]: null, [player2]: null }, scores: { [player1]: 0, [player2]: 0 }, revealed: false }
  }
  return { type: 'TICTACTOE', board: Array(9).fill(null), currentTurn: player1, scores: { [player1]: 0, [player2]: 0 }, moveCount: 0 }
}

export function checkTTTWinner(board: (string | null)[]): string | null {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!
  }
  return null
}

export function rpsResult(a: string, b: string): 'win' | 'lose' | 'draw' {
  if (a === b) return 'draw'
  if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')) return 'win'
  return 'lose'
}

// Simple in-memory KV store — for production use Upstash Redis or similar
// Vercel functions are stateless so this resets on cold start
// For a real deployment, replace with a Redis/KV store
const _rooms = new Map<string, Room>()
const _queue = new Map<string, { gameType: GameType; wagerAmount: string; address: string; ts: number }>()

export const store = {
  getRoom: (id: string) => _rooms.get(id),
  setRoom: (id: string, room: Room) => _rooms.set(id, room),
  getAllRooms: () => Array.from(_rooms.values()),
  getQueue: () => Array.from(_queue.entries()),
  addToQueue: (address: string, data: { gameType: GameType; wagerAmount: string; address: string; ts: number }) => _queue.set(address, data),
  removeFromQueue: (address: string) => _queue.delete(address),
  findMatch: (gameType: GameType, wagerAmount: string, address: string) => {
    for (const [addr, data] of _queue.entries()) {
      if (addr !== address && data.gameType === gameType && data.wagerAmount === wagerAmount) {
        return addr
      }
    }
    return null
  },
}

export function getAbly() {
  return new Ably.Rest(process.env.ABLY_API_KEY!)
}

export async function publishToRoom(roomId: string, event: string, data: unknown) {
  const ably = getAbly()
  const channel = ably.channels.get(`room:${roomId}`)
  await channel.publish(event, data)
}

export async function publishToPlayer(address: string, event: string, data: unknown) {
  const ably = getAbly()
  const channel = ably.channels.get(`player:${address.toLowerCase()}`)
  await channel.publish(event, data)
}

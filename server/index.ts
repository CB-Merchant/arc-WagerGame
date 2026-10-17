import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { WebSocketServer, WebSocket } from 'ws'

const DIST_DIR = join(import.meta.dirname ?? process.cwd(), '..', 'dist')
const SERVE_STATIC = existsSync(DIST_DIR)

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
}

function serveStatic(url: string, res: import('http').ServerResponse): boolean {
  if (!SERVE_STATIC) return false
  // Strip query string
  const pathname = url.split('?')[0]
  let filePath = join(DIST_DIR, pathname)
  if (!existsSync(filePath) || !filePath.includes('.')) {
    filePath = join(DIST_DIR, 'index.html') // SPA fallback
  }
  if (!existsSync(filePath)) return false
  const ext = extname(filePath)
  const mime = MIME[ext] ?? 'application/octet-stream'
  try {
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
    return true
  } catch {
    return false
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type GameType = 'TRIVIA' | 'RPS' | 'NUMBER_GUESS' | 'TICTACTOE'
export type RoomStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED'

export interface Room {
  roomId: string
  player1: string
  player2: string | null
  wagerAmount: string // in USDC 6-decimal string
  gameType: GameType
  isPrivate: boolean
  status: RoomStatus
  winner: string | null
  createdAt: number
  gameState: GameState | null
}

export type GameState =
  | TriviaState
  | RPSState
  | NumberGuessState
  | TicTacToeState

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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const QUESTIONS_PER_GAME = 5

// ─── In-memory store ──────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const connections = new Map<string, WebSocket>() // address -> ws
const roomSockets = new Map<string, Set<string>>() // roomId -> set of addresses

// Matchmaking queue: address -> { gameType, wagerAmount, salt }
const matchmakingQueue = new Map<string, { gameType: GameType; wagerAmount: string; salt: string; ws: WebSocket }>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function broadcast(roomId: string, msg: object, excludeAddress?: string) {
  const addrs = roomSockets.get(roomId)
  if (!addrs) return
  for (const addr of addrs) {
    if (addr === excludeAddress) continue
    const ws = connections.get(addr)
    if (ws) send(ws, msg)
  }
}

function broadcastAll(roomId: string, msg: object) {
  broadcast(roomId, msg)
}

function removeFromQueue(address: string) {
  matchmakingQueue.delete(address)
}

function initGameState(gameType: GameType, player1: string, player2: string): GameState {
  if (gameType === 'TRIVIA') {
    const shuffled = [...TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, QUESTIONS_PER_GAME)
    return {
      type: 'TRIVIA',
      currentQuestion: 0,
      questions: shuffled,
      scores: { [player1]: 0, [player2]: 0 },
      answered: { [player1]: null, [player2]: null },
      roundComplete: false,
    } as TriviaState
  }
  if (gameType === 'RPS') {
    return {
      type: 'RPS',
      round: 1,
      maxRounds: 5,
      scores: { [player1]: 0, [player2]: 0 },
      choices: { [player1]: null, [player2]: null },
      roundResult: null,
    } as RPSState
  }
  if (gameType === 'NUMBER_GUESS') {
    return {
      type: 'NUMBER_GUESS',
      round: 1,
      maxRounds: 5,
      targetNumber: Math.floor(Math.random() * 100) + 1,
      guesses: { [player1]: null, [player2]: null },
      scores: { [player1]: 0, [player2]: 0 },
      revealed: false,
    } as NumberGuessState
  }
  // TICTACTOE
  return {
    type: 'TICTACTOE',
    board: Array(9).fill(null),
    currentTurn: player1,
    scores: { [player1]: 0, [player2]: 0 },
    moveCount: 0,
  } as TicTacToeState
}

function checkTTTWinner(board: (string | null)[]): string | null {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!
  }
  return null
}

function rpsResult(a: string, b: string): 'win' | 'lose' | 'draw' {
  if (a === b) return 'draw'
  if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')) return 'win'
  return 'lose'
}

// ─── Message handlers ─────────────────────────────────────────────────────────

function broadcastOnlineCount() {
  const count = connections.size
  const msg = { type: 'online_count', count }
  for (const ws of connections.values()) send(ws, msg)
}

function handleRegister(ws: WebSocket, data: { address: string }) {
  connections.set(data.address.toLowerCase(), ws)
  send(ws, { type: 'registered', address: data.address.toLowerCase() })
  // Tell the new client their own count immediately, then broadcast to all
  send(ws, { type: 'online_count', count: connections.size })
  broadcastOnlineCount()
}

function handleGetRooms(_ws: WebSocket, _data: unknown) {
  // Return public open rooms
  const openRooms = Array.from(rooms.values()).filter(r => r.status === 'WAITING' && !r.isPrivate)
  return openRooms
}

function handleJoinRoom(ws: WebSocket, data: { roomId: string; address: string }) {
  const address = data.address.toLowerCase()
  const room = rooms.get(data.roomId)
  if (!room) { send(ws, { type: 'error', message: 'Room not found' }); return }

  if (!roomSockets.has(data.roomId)) roomSockets.set(data.roomId, new Set())
  roomSockets.get(data.roomId)!.add(address)

  send(ws, { type: 'room_state', room })
}

function handleCreateRoom(ws: WebSocket, data: {
  roomId: string
  address: string
  gameType: GameType
  wagerAmount: string
  isPrivate: boolean
  salt: string
}) {
  const address = data.address.toLowerCase()
  const room: Room = {
    roomId: data.roomId,
    player1: address,
    player2: null,
    wagerAmount: data.wagerAmount,
    gameType: data.gameType,
    isPrivate: data.isPrivate,
    status: 'WAITING',
    winner: null,
    createdAt: Date.now(),
    gameState: null,
  }
  rooms.set(data.roomId, room)
  if (!roomSockets.has(data.roomId)) roomSockets.set(data.roomId, new Set())
  roomSockets.get(data.roomId)!.add(address)
  send(ws, { type: 'room_created', room })
}

function handlePlayerJoined(ws: WebSocket, data: { roomId: string; address: string }) {
  const address = data.address.toLowerCase()
  const room = rooms.get(data.roomId)
  if (!room || room.status !== 'WAITING') { send(ws, { type: 'error', message: 'Invalid room join' }); return }

  room.player2 = address
  room.status = 'ACTIVE'

  // Init game state
  room.gameState = initGameState(room.gameType, room.player1, address)

  if (!roomSockets.has(data.roomId)) roomSockets.set(data.roomId, new Set())
  roomSockets.get(data.roomId)!.add(address)

  broadcastAll(data.roomId, { type: 'game_started', room })
}

function handleMatchmake(ws: WebSocket, data: { address: string; gameType: GameType; wagerAmount: string; salt: string }) {
  const address = data.address.toLowerCase()
  removeFromQueue(address)

  // Find a matching player in queue
  for (const [qAddr, qData] of matchmakingQueue.entries()) {
    if (qAddr === address) continue
    if (qData.gameType === data.gameType && qData.wagerAmount === data.wagerAmount) {
      // Match found
      matchmakingQueue.delete(qAddr)

      send(ws, {
        type: 'match_found',
        opponent: qAddr,
        roomSalt: qData.salt,
        player1Address: qAddr,
        player2Address: address,
        gameType: data.gameType,
        wagerAmount: data.wagerAmount,
      })
      send(qData.ws, {
        type: 'match_found',
        opponent: address,
        roomSalt: qData.salt,
        player1Address: qAddr,
        player2Address: address,
        gameType: data.gameType,
        wagerAmount: data.wagerAmount,
      })
      return
    }
  }

  // No match — add to queue
  matchmakingQueue.set(address, { gameType: data.gameType, wagerAmount: data.wagerAmount, salt: data.salt, ws })
  send(ws, { type: 'queued', message: 'Searching for opponent...' })
}

function handleCancelMatchmake(_ws: WebSocket, data: { address: string }) {
  removeFromQueue(data.address.toLowerCase())
}

function handleGameAction(ws: WebSocket, data: {
  roomId: string
  address: string
  action: string
  payload: unknown
}) {
  const address = data.address.toLowerCase()
  const room = rooms.get(data.roomId)
  if (!room || room.status !== 'ACTIVE' || !room.gameState) {
    send(ws, { type: 'error', message: 'Game not active' })
    return
  }

  const gs = room.gameState

  if (gs.type === 'TRIVIA') {
    handleTriviaAction(room, gs, address, data.payload as { answerIndex: number })
  } else if (gs.type === 'RPS') {
    handleRPSAction(room, gs, address, data.payload as { choice: 'rock' | 'paper' | 'scissors' })
  } else if (gs.type === 'NUMBER_GUESS') {
    handleNumberGuessAction(room, gs, address, data.payload as { guess: number })
  } else if (gs.type === 'TICTACTOE') {
    handleTicTacToeAction(room, gs, address, data.payload as { index: number }, ws)
  }

  broadcastAll(data.roomId, { type: 'game_state', room })
}

function handleTriviaAction(room: Room, gs: TriviaState, address: string, payload: { answerIndex: number }) {
  if (gs.answered[address] !== null) return // already answered
  const q = gs.questions[gs.currentQuestion]
  gs.answered[address] = payload.answerIndex
  if (payload.answerIndex === q.correct) gs.scores[address] = (gs.scores[address] || 0) + 1

  // Check if both answered
  const p1 = room.player1
  const p2 = room.player2!
  if (gs.answered[p1] !== null && gs.answered[p2] !== null) {
    gs.roundComplete = true
    if (gs.currentQuestion + 1 >= gs.questions.length) {
      // Game over
      const winner = gs.scores[p1] > gs.scores[p2] ? p1 : gs.scores[p2] > gs.scores[p1] ? p2 : null
      finishGame(room, winner)
    } else {
      // Next question after delay (handled by frontend)
      setTimeout(() => {
        gs.currentQuestion++
        gs.answered = { [p1]: null, [p2]: null }
        gs.roundComplete = false
        broadcastAll(room.roomId, { type: 'game_state', room })
      }, 2500)
    }
  }
}

function handleRPSAction(room: Room, gs: RPSState, address: string, payload: { choice: 'rock' | 'paper' | 'scissors' }) {
  gs.choices[address] = payload.choice
  const p1 = room.player1
  const p2 = room.player2!
  if (gs.choices[p1] && gs.choices[p2]) {
    const c1 = gs.choices[p1]!
    const c2 = gs.choices[p2]!
    const res = rpsResult(c1, c2)
    if (res === 'win') gs.scores[p1]++
    else if (res === 'lose') gs.scores[p2]++
    gs.roundResult = `${c1} vs ${c2}`
    if (gs.round >= gs.maxRounds || gs.scores[p1] > gs.maxRounds / 2 || gs.scores[p2] > gs.maxRounds / 2) {
      const winner = gs.scores[p1] > gs.scores[p2] ? p1 : gs.scores[p2] > gs.scores[p1] ? p2 : null
      finishGame(room, winner)
    } else {
      setTimeout(() => {
        gs.round++
        gs.choices = { [p1]: null, [p2]: null }
        gs.roundResult = null
        broadcastAll(room.roomId, { type: 'game_state', room })
      }, 2000)
    }
  }
}

function handleNumberGuessAction(room: Room, gs: NumberGuessState, address: string, payload: { guess: number }) {
  if (gs.guesses[address] !== null) return
  gs.guesses[address] = payload.guess
  const p1 = room.player1
  const p2 = room.player2!
  if (gs.guesses[p1] !== null && gs.guesses[p2] !== null) {
    gs.revealed = true
    const diff1 = Math.abs((gs.guesses[p1] ?? 0) - gs.targetNumber)
    const diff2 = Math.abs((gs.guesses[p2] ?? 0) - gs.targetNumber)
    if (diff1 < diff2) gs.scores[p1]++
    else if (diff2 < diff1) gs.scores[p2]++

    if (gs.round >= gs.maxRounds) {
      const winner = gs.scores[p1] > gs.scores[p2] ? p1 : gs.scores[p2] > gs.scores[p1] ? p2 : null
      finishGame(room, winner)
    } else {
      setTimeout(() => {
        gs.round++
        gs.targetNumber = Math.floor(Math.random() * 100) + 1
        gs.guesses = { [p1]: null, [p2]: null }
        gs.revealed = false
        broadcastAll(room.roomId, { type: 'game_state', room })
      }, 2500)
    }
  }
}

function handleTicTacToeAction(room: Room, gs: TicTacToeState, address: string, payload: { index: number }, ws: WebSocket) {
  if (gs.currentTurn !== address) { send(ws, { type: 'error', message: 'Not your turn' }); return }
  if (gs.board[payload.index] !== null) { send(ws, { type: 'error', message: 'Cell taken' }); return }

  gs.board[payload.index] = address
  gs.moveCount++
  const tttWinner = checkTTTWinner(gs.board)
  if (tttWinner) {
    finishGame(room, tttWinner)
  } else if (gs.moveCount === 9) {
    finishGame(room, null) // draw
  } else {
    gs.currentTurn = gs.currentTurn === room.player1 ? room.player2! : room.player1
  }
}

function finishGame(room: Room, winner: string | null) {
  room.status = 'FINISHED'
  room.winner = winner
  broadcastAll(room.roomId, {
    type: 'game_finished',
    room,
    winner,
    message: winner ? `Game over! Winner: ${winner}` : 'Game over! Draw — both players refunded.',
  })
}

// ─── REST Endpoints ───────────────────────────────────────────────────────────

function handleHTTP(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = req.url ?? ''

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, queue: matchmakingQueue.size }))
    return
  }

  if (req.method === 'GET' && url === '/rooms') {
    const openRooms = Array.from(rooms.values()).filter(r => r.status === 'WAITING' && !r.isPrivate)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ rooms: openRooms }))
    return
  }

  if (req.method === 'GET' && url.startsWith('/room/')) {
    const roomId = url.replace('/room/', '')
    const room = rooms.get(roomId)
    if (!room) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ room }))
    return
  }

  // Serve built frontend files (SPA fallback)
  if (serveStatic(url, res)) return

  res.writeHead(404)
  res.end()
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const httpServer = createServer(handleHTTP)
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  let clientAddress: string | null = null

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString())
      const { type, ...data } = msg

      if (type === 'register') { handleRegister(ws, data); clientAddress = data.address?.toLowerCase(); return }
      if (type === 'get_rooms') { const r = handleGetRooms(ws, data); send(ws, { type: 'rooms', rooms: r }); return }
      if (type === 'join_room') { handleJoinRoom(ws, data); return }
      if (type === 'create_room') { handleCreateRoom(ws, data); return }
      if (type === 'player_joined') { handlePlayerJoined(ws, data); return }
      if (type === 'matchmake') { handleMatchmake(ws, data); return }
      if (type === 'cancel_matchmake') { handleCancelMatchmake(ws, data); return }
      if (type === 'game_action') { handleGameAction(ws, data); return }
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' })
    }
  })

  ws.on('close', () => {
    if (clientAddress) {
      connections.delete(clientAddress)
      removeFromQueue(clientAddress)
    }
    broadcastOnlineCount()
  })
})

const PORT = Number(process.env.PORT ?? 7860)
httpServer.listen(PORT, () => {
  console.log(`WagerGame server running on port ${PORT}`)
})

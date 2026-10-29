import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, CheckCircle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits, pad } from 'viem'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { TriviaGame } from './games/TriviaGame'
import { RPSGame } from './games/RPSGame'
import { NumberGuessGame } from './games/NumberGuessGame'
import { TicTacToeGame } from './games/TicTacToeGame'
import type { GameType } from '../hooks/useGameServer'
import { WAGER_GAME_ABI } from '../abi/WagerGame'

const ARC_TESTNET_CHAIN_ID = 5042002
const USDC_FACT = getUsdc(ARC_TESTNET_CHAIN_ID)!
const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
const USDC_DECIMALS = USDC_FACT.decimals
const CONTRACT_ADDRESS = (import.meta.env.VITE_WAGER_CONTRACT ?? '') as `0x${string}`

interface GameRoomProps {
  address: string
  chainId: number
  roomId: string
  gameType: GameType
  wagerAmount: string
  isPlayer1: boolean
  opponentAddress: string
  isPrivate: boolean
  onLeave: () => void
}

type TxPhase = 'idle' | 'approving' | 'approved' | 'creating_room' | 'waiting_opponent' | 'game_active' | 'game_over'

// Local game state types
interface TriviaState { type: 'TRIVIA'; questionIndex: number; scores: { p1: number; p2: number }; answered: { p1: boolean; p2: boolean } }
interface RPSState { type: 'RPS'; round: number; maxRounds: number; scores: { p1: number; p2: number }; moves: { p1: string | null; p2: string | null } }
interface NumberState { type: 'NUMBER_GUESS'; target: number; guesses: { p1: number | null; p2: number | null } }
interface TicTacToeState { type: 'TICTACTOE'; board: (string | null)[]; currentTurn: 'p1' | 'p2'; winner: string | null }
type GameState = TriviaState | RPSState | NumberState | TicTacToeState

function initLocalState(gameType: GameType): GameState {
  switch (gameType) {
    case 'TRIVIA': return { type: 'TRIVIA', questionIndex: 0, scores: { p1: 0, p2: 0 }, answered: { p1: false, p2: false } }
    case 'RPS': return { type: 'RPS', round: 1, maxRounds: 5, scores: { p1: 0, p2: 0 }, moves: { p1: null, p2: null } }
    case 'NUMBER_GUESS': return { type: 'NUMBER_GUESS', target: Math.floor(Math.random() * 100) + 1, guesses: { p1: null, p2: null } }
    case 'TICTACTOE': return { type: 'TICTACTOE', board: Array(9).fill(null) as (string | null)[], currentTurn: 'p1', winner: null }
  }
}

const TRIVIA_QUESTIONS = [
  { q: 'What is the native gas token on Arc?', options: ['ETH', 'USDC', 'ARC', 'MATIC'], answer: 1 },
  { q: 'What does USDC stand for?', options: ['Universal Stable Digital Currency', 'US Dollar Coin', 'USD Coin', 'United States Digital Cash'], answer: 2 },
  { q: 'What company issues USDC?', options: ['Coinbase', 'Circle', 'Binance', 'Tether'], answer: 1 },
  { q: 'What is the ERC standard for fungible tokens?', options: ['ERC-721', 'ERC-1155', 'ERC-20', 'ERC-4337'], answer: 2 },
  { q: 'What does CCTP stand for?', options: ['Cross-Chain Transfer Protocol', 'Crypto Coin Transfer Program', 'Circle Cross Transfer Process', 'Chain Currency Transfer Protocol'], answer: 0 },
]

export function GameRoom({ address, chainId, roomId, gameType, wagerAmount, isPlayer1, opponentAddress, isPrivate, onLeave }: GameRoomProps) {
  const [txPhase, setTxPhase] = useState<TxPhase>('idle')
  const [copied, setCopied] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [localWinner, setLocalWinner] = useState<'me' | 'opponent' | 'draw' | null>(null)
  const [opponentReady, setOpponentReady] = useState(false)
  const [roomPin, setRoomPin] = useState<string | null>(null)
  const ablyChannelRef = useRef<{ publish: (name: string, data: unknown) => Promise<unknown>; unsubscribe: () => void } | null>(null)

  const wagerBigInt = parseUnits(wagerAmount, USDC_DECIMALS)
  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID
  const myRole = isPlayer1 ? 'p1' : 'p2'

  // Allowance check
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: [address as `0x${string}`, CONTRACT_ADDRESS], chainId: ARC_TESTNET_CHAIN_ID,
  })
  const hasAllowance = allowance !== undefined && allowance >= wagerBigInt

  // Wagmi hooks
  const { writeContract: approveUsdc, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: createRoom, data: createHash, isPending: isCreating } = useWriteContract()
  const { isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash })
  const { writeContract: joinRoomOnChain, data: joinHash, isPending: isJoining } = useWriteContract()
  const { isSuccess: joinSuccess } = useWaitForTransactionReceipt({ hash: joinHash })

  const processedApprove = useRef<string | undefined>(undefined)
  const processedCreate = useRef<string | undefined>(undefined)
  const processedJoin = useRef<string | undefined>(undefined)

  // Connect to Ably room channel for game sync
  useEffect(() => {
    if (!roomId) return
    let ch: import('ably').RealtimeChannel | null = null

    void (async () => {
      const Ably = await import('ably')
      const client = new Ably.Realtime({ authUrl: '/api/auth', authParams: { clientId: address }, clientId: address })
      ch = client.channels.get(`room:${roomId}`)

      void ch.subscribe('game_start', (msg) => {
        setGameState(msg.data as GameState)
        setTxPhase('game_active')
      })
      void ch.subscribe('game_state', (msg) => {
        setGameState(msg.data as GameState)
      })
      void ch.subscribe('game_over', (msg) => {
        const d = msg.data as { state: GameState; winner: string | null }
        setGameState(d.state)
        setLocalWinner(d.winner === null ? 'draw' : d.winner === myRole ? 'me' : 'opponent')
        setTxPhase('game_over')
      })
      void ch.subscribe('opponent_ready', () => { setOpponentReady(true) })

      ablyChannelRef.current = {
        publish: (name: string, data: unknown) => ch!.publish(name, data),
        unsubscribe: () => { ch?.unsubscribe() },
      }
    })()

    return () => { ch?.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Approve confirmed
  useEffect(() => {
    if (approveHash && approveSuccess && processedApprove.current !== approveHash) {
      processedApprove.current = approveHash
      setTxPhase('approved')
    }
  }, [approveHash, approveSuccess])

  // Create room confirmed — notify backend + wait for opponent
  useEffect(() => {
    if (createHash && createSuccess && processedCreate.current !== createHash) {
      processedCreate.current = createHash
      fetch('/api/create-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, wagerAmount, isPrivate, player1: address, onChainRoomId: roomId }),
      }).then(r => r.json()).then((d: { pin?: string }) => {
        if (d.pin) setRoomPin(d.pin)
      }).catch(() => null)
      setTxPhase('waiting_opponent')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createHash, createSuccess])

  // Join room confirmed — notify backend, signal ready, start game locally
  useEffect(() => {
    if (joinHash && joinSuccess && processedJoin.current !== joinHash) {
      processedJoin.current = joinHash
      // Notify backend player2 joined
      void fetch('/api/join-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, player2: address }),
      })
      // Signal to player1 that opponent joined
      void ablyChannelRef.current?.publish('opponent_ready', { player2: address })
      // Start game for player2 immediately
      const gs = initLocalState(gameType)
      setGameState(gs)
      setTxPhase('game_active')
      // Send game_start to player1 with initial state
      void ablyChannelRef.current?.publish('game_start', gs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinHash, joinSuccess])

  // Player1: when opponent_ready fires, start game
  useEffect(() => {
    if (isPlayer1 && opponentReady && txPhase === 'waiting_opponent') {
      const gs = initLocalState(gameType)
      setGameState(gs)
      setTxPhase('game_active')
    }
  }, [isPlayer1, opponentReady, txPhase, gameType])

  const handleApprove = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    setTxPhase('approving')
    approveUsdc({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [CONTRACT_ADDRESS, wagerBigInt], chainId: ARC_TESTNET_CHAIN_ID })
  }, [isWrongChain, approveUsdc, wagerBigInt])

  const handleCreateRoom = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    const saltBytes = pad(roomId as `0x${string}`, { size: 32 })
    setTxPhase('creating_room')
    createRoom({ address: CONTRACT_ADDRESS, abi: WAGER_GAME_ABI, functionName: 'createRoom',
      args: [['TRIVIA', 'RPS', 'NUMBER_GUESS', 'TICTACTOE'].indexOf(gameType), wagerBigInt, isPrivate, saltBytes],
      chainId: ARC_TESTNET_CHAIN_ID })
  }, [isWrongChain, createRoom, roomId, gameType, wagerBigInt, isPrivate])

  const handleJoinRoom = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    joinRoomOnChain({ address: CONTRACT_ADDRESS, abi: WAGER_GAME_ABI, functionName: 'joinRoom',
      args: [roomId as `0x${string}`], chainId: ARC_TESTNET_CHAIN_ID })
  }, [isWrongChain, joinRoomOnChain, roomId])

  // Handle a game move — update local state and broadcast to opponent
  const handleGameAction = useCallback((action: string, payload: unknown) => {
    if (!gameState) return
    if (gameState.type === 'TRIVIA' && action === 'answer') {
      const state = gameState
      const newAnswered = { ...state.answered, [myRole]: true }
      const newScores = { ...state.scores }
      const q = TRIVIA_QUESTIONS[state.questionIndex]
      if ((payload as { answerIndex: number }).answerIndex === q.answer) newScores[myRole]++
      const newState: TriviaState = { ...state, answered: newAnswered, scores: newScores }

      if (newAnswered.p1 && newAnswered.p2) {
        const next = state.questionIndex + 1
        if (next >= TRIVIA_QUESTIONS.length) {
          const w = newScores.p1 > newScores.p2 ? 'p1' : newScores.p2 > newScores.p1 ? 'p2' : null
          setLocalWinner(w === null ? 'draw' : w === myRole ? 'me' : 'opponent')
          setTxPhase('game_over')
          void ablyChannelRef.current?.publish('game_over', { state: newState, winner: w })
          // Notify contract resolver
          if (w) void fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, winner: w === 'p1' ? address : opponentAddress }) })
          return
        }
        const resetState: TriviaState = { ...newState, questionIndex: next, answered: { p1: false, p2: false } }
        setGameState(resetState)
        void ablyChannelRef.current?.publish('game_state', resetState)
      } else {
        setGameState(newState)
        void ablyChannelRef.current?.publish('game_state', newState)
      }
      return
    }

    if (gameState.type === 'RPS' && action === 'choice') {
      const state = gameState
      const newMoves = { ...state.moves, [myRole]: (payload as { choice: string }).choice }
      const newState: RPSState = { ...state, moves: newMoves }
      if (newMoves.p1 && newMoves.p2) {
        const newScores = { ...state.scores }
        const wins: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
        if (newMoves.p1 !== newMoves.p2) {
          if (wins[newMoves.p1] === newMoves.p2) newScores.p1++; else newScores.p2++
        }
        const round = state.round + 1
        if (round > state.maxRounds || newScores.p1 > 2 || newScores.p2 > 2) {
          const w = newScores.p1 > newScores.p2 ? 'p1' : newScores.p2 > newScores.p1 ? 'p2' : null
          setLocalWinner(w === null ? 'draw' : w === myRole ? 'me' : 'opponent')
          setTxPhase('game_over')
          void ablyChannelRef.current?.publish('game_over', { state: { ...newState, scores: newScores }, winner: w })
          if (w) void fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, winner: w === 'p1' ? address : opponentAddress }) })
          return
        }
        const nextState: RPSState = { ...newState, scores: newScores, round, moves: { p1: null, p2: null } }
        setGameState(nextState)
        void ablyChannelRef.current?.publish('game_state', nextState)
      } else {
        setGameState(newState)
        void ablyChannelRef.current?.publish('game_state', newState)
      }
      return
    }

    if (gameState.type === 'NUMBER_GUESS' && action === 'guess') {
      const state = gameState
      const newGuesses = { ...state.guesses, [myRole]: (payload as { guess: number }).guess }
      const newState: NumberState = { ...state, guesses: newGuesses }
      if (newGuesses.p1 !== null && newGuesses.p2 !== null) {
        const d1 = Math.abs(newGuesses.p1 - state.target)
        const d2 = Math.abs(newGuesses.p2 - state.target)
        const w = d1 < d2 ? 'p1' : d2 < d1 ? 'p2' : null
        setLocalWinner(w === null ? 'draw' : w === myRole ? 'me' : 'opponent')
        setTxPhase('game_over')
        void ablyChannelRef.current?.publish('game_over', { state: newState, winner: w })
        if (w) void fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, winner: w === 'p1' ? address : opponentAddress }) })
        return
      }
      setGameState(newState)
      void ablyChannelRef.current?.publish('game_state', newState)
      return
    }

    if (gameState.type === 'TICTACTOE' && action === 'move') {
      const state = gameState
      if (state.currentTurn !== myRole) { toast.error("Not your turn!"); return }
      const idx = (payload as { index: number }).index
      if (state.board[idx] !== null) return
      const newBoard = [...state.board]
      newBoard[idx] = myRole
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
      let tttWinner: string | null = null
      for (const [a, b, c] of lines) {
        if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) { tttWinner = newBoard[a]; break }
      }
      const isDraw = !tttWinner && newBoard.every(c => c !== null)
      const newState: TicTacToeState = { ...state, board: newBoard, currentTurn: myRole === 'p1' ? 'p2' : 'p1', winner: tttWinner }
      if (tttWinner || isDraw) {
        const w = tttWinner ?? null
        setLocalWinner(w === null ? 'draw' : w === myRole ? 'me' : 'opponent')
        setTxPhase('game_over')
        void ablyChannelRef.current?.publish('game_over', { state: newState, winner: w })
        if (w) void fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, winner: w === 'p1' ? address : opponentAddress }) })
        return
      }
      setGameState(newState)
      void ablyChannelRef.current?.publish('game_state', newState)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, myRole, address, opponentAddress, roomId])

  const copyCode = () => {
    void navigator.clipboard.writeText(roomPin ?? roomId)
    setCopied(true)
    toast.success('Room code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!CONTRACT_ADDRESS) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <p className="font-semibold" style={{ color: 'var(--danger)' }}>Contract not deployed yet.</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Deploy the WagerGame contract and set VITE_WAGER_CONTRACT in .env</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onLeave} className="text-sm font-medium" style={{ color: 'var(--muted)' }}>← Leave</button>
        <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {gameType.replace('_', ' ')}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: txPhase === 'game_active' ? 'var(--success)' : txPhase === 'game_over' ? 'var(--danger)' : '#f59e0b' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {txPhase === 'game_active' ? 'Live' : txPhase === 'game_over' ? 'Finished' : 'Preparing'}
          </span>
        </div>
      </div>

      {/* Prize Pool */}
      <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: 'var(--accent)', color: 'white' }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
        <p className="text-xs opacity-75">Prize Pool</p>
        <p className="display text-3xl font-bold tabular-nums">{(parseFloat(wagerAmount) * 2 * 0.98).toFixed(2)} <span className="text-lg">USDC</span></p>
        <p className="mt-0.5 text-xs opacity-60">{wagerAmount} each · 2% platform fee</p>
      </div>

      <AnimatePresence mode="wait">
        {/* ── PLAYER 1 FLOW ── */}
        {isPlayer1 && txPhase === 'idle' && (
          <motion.div key="p1-approve" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <StepCard step={1} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Approve USDC</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Allow the contract to hold your {wagerAmount} USDC wager</p>
              <button onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove} disabled={isApproving}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
                {isApproving ? 'Confirm in wallet...' : hasAllowance ? 'Already approved — continue' : `Approve ${wagerAmount} USDC`}
              </button>
            </StepCard>
            <StepCard step={2}><p className="text-sm" style={{ color: 'var(--muted)' }}>Create room on-chain</p></StepCard>
            <StepCard step={3}><p className="text-sm" style={{ color: 'var(--muted)' }}>Share code, wait for opponent</p></StepCard>
          </motion.div>
        )}

        {isPlayer1 && txPhase === 'approved' && (
          <motion.div key="p1-create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <StepCard step={1} done><p className="text-sm" style={{ color: 'var(--success)' }}>USDC approved</p></StepCard>
            <StepCard step={2} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Create Room on-chain</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Locks your wager in the smart contract</p>
              <button onClick={handleCreateRoom} disabled={isCreating}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
                {isCreating ? 'Confirm in wallet...' : 'Create Room'}
              </button>
            </StepCard>
          </motion.div>
        )}

        {isPlayer1 && (txPhase === 'creating_room' || txPhase === 'waiting_opponent') && (
          <motion.div key="p1-wait" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)', border: '2px solid var(--accent)' }}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Room Code
              </p>
              <div className="flex items-center justify-between gap-3">
                <p className="mono text-5xl font-black tracking-[0.2em]" style={{ color: 'var(--ink)' }}>
                  {roomPin ?? '····'}
                </p>
                <button onClick={copyCode} className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
                  {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                Share this 4-digit code with your opponent
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-2xl py-4" style={{ background: 'var(--surface-muted)' }}>
              {txPhase === 'creating_room'
                ? <><div className="h-5 w-5 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--accent)' }} /><p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Confirming on-chain...</p></>
                : <><div className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} /><p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Waiting for opponent to join...</p></>
              }
            </div>
          </motion.div>
        )}

        {/* ── PLAYER 2 FLOW ── */}
        {!isPlayer1 && txPhase === 'idle' && (
          <motion.div key="p2-approve" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StepCard step={1} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Approve USDC</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Allow the contract to hold your {wagerAmount} USDC wager</p>
              <button onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove} disabled={isApproving}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
                {isApproving ? 'Confirm in wallet...' : hasAllowance ? 'Already approved — continue' : `Approve ${wagerAmount} USDC`}
              </button>
            </StepCard>
          </motion.div>
        )}

        {!isPlayer1 && txPhase === 'approved' && (
          <motion.div key="p2-join" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StepCard step={2} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Join Room on-chain</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Lock your {wagerAmount} USDC wager and start the game</p>
              <button onClick={handleJoinRoom} disabled={isJoining}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
                {isJoining ? 'Confirm in wallet...' : 'Join & Start Game'}
              </button>
            </StepCard>
          </motion.div>
        )}

        {/* ── ACTIVE GAME ── */}
        {txPhase === 'game_active' && gameState && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {gameState.type === 'TRIVIA' && (
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
              <TriviaGame state={gameState as any} myAddress={address} opponentAddress={opponentAddress} onAnswer={(i) => handleGameAction('answer', { answerIndex: i })} />
            )}
            {gameState.type === 'RPS' && (
              <RPSGame state={gameState as any} myAddress={address} opponentAddress={opponentAddress} onChoice={(c) => handleGameAction('choice', { choice: c })} />
            )}
            {gameState.type === 'NUMBER_GUESS' && (
              <NumberGuessGame state={gameState as any} myAddress={address} opponentAddress={opponentAddress} onGuess={(g) => handleGameAction('guess', { guess: g })} />
            )}
            {gameState.type === 'TICTACTOE' && (
              <TicTacToeGame state={gameState as any} myAddress={address} opponentAddress={opponentAddress} onMove={(i) => handleGameAction('move', { index: i })} />
              /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
            )}
          </motion.div>
        )}

        {/* ── GAME OVER ── */}
        {txPhase === 'game_over' && (
          <motion.div key="over" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl p-6 text-center"
              style={{ background: localWinner === 'me' ? 'var(--success)' : localWinner === 'draw' ? 'var(--surface-muted)' : 'var(--danger)', color: localWinner === 'draw' ? 'var(--ink)' : 'white' }}>
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
              <p className="display mb-1 text-4xl font-bold">
                {localWinner === 'me' ? '🏆 You Won!' : localWinner === 'draw' ? 'Draw!' : 'You Lost'}
              </p>
              {localWinner === 'me' && <p className="text-lg font-semibold opacity-90">+{(parseFloat(wagerAmount) * 2 * 0.98).toFixed(2)} USDC</p>}
              {localWinner === 'draw' && <p className="opacity-75">Both players refunded</p>}
            </div>
            {createHash && (
              <a href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, createHash)} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                <ExternalLink size={14} /> View on explorer
              </a>
            )}
            <button onClick={onLeave} className="w-full rounded-2xl py-4 font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
              Back to Lobby
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepCard({ step, active, done, children }: { step: number; active?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl p-4" style={{ background: active ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.5)', backdropFilter: 'blur(16px)', border: active ? '2px solid var(--accent)' : '1.5px solid rgba(255,255,255,0.8)', opacity: done ? 0.7 : 1 }}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface-muted)', color: done || active ? 'white' : 'var(--muted)' }}>
        {done ? '✓' : step}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

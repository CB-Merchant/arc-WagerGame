import { useState, useEffect, useCallback, useRef } from 'react'
import { Copy, CheckCircle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from 'wagmi'
import { erc20Abi, parseUnits, pad } from 'viem'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { TriviaGame } from './games/TriviaGame'
import { RPSGame } from './games/RPSGame'
import { NumberGuessGame } from './games/NumberGuessGame'
import { TicTacToeGame } from './games/TicTacToeGame'
import type { GameType } from '../hooks/useGameServer'
import { WAGER_GAME_ABI } from '../abi/WagerGame'
import { getAbly } from '../hooks/useAblyGame'

const ARC_TESTNET_CHAIN_ID = 5042002
const USDC_FACT = getUsdc(ARC_TESTNET_CHAIN_ID)!
const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
const USDC_DECIMALS = USDC_FACT.decimals
const CONTRACT_ADDRESS = (import.meta.env.VITE_WAGER_CONTRACT ?? '') as `0x${string}`

interface GameRoomProps {
  address: string
  roomId: string
  gameType: GameType
  wagerAmount: string
  isPlayer1: boolean
  opponentAddress: string
  isPrivate: boolean
  isMatchmaking?: boolean   // true = matched via public queue, skip room-code UI
  onLeave: () => void
}

type TxPhase = 'idle' | 'approving' | 'approved' | 'creating_room' | 'waiting_opponent' | 'game_active' | 'game_over'

// Local game state types
interface TriviaState { type: 'TRIVIA'; questionIndex: number; scores: { p1: number; p2: number }; answered: { p1: boolean; p2: boolean } }
interface RPSState { type: 'RPS'; round: number; maxRounds: number; scores: { p1: number; p2: number }; moves: { p1: string | null; p2: string | null } }
interface NumberRound { p1: number | null; p2: number | null }
interface NumberState { type: 'NUMBER_GUESS'; target: number; round: number; maxRounds: number; history: NumberRound[]; currentGuesses: { p1: number | null; p2: number | null } }
interface TicTacToeState { type: 'TICTACTOE'; board: (string | null)[]; currentTurn: 'p1' | 'p2'; winner: string | null }
type GameState = TriviaState | RPSState | NumberState | TicTacToeState

function initLocalState(gameType: GameType): GameState {
  switch (gameType) {
    case 'TRIVIA': return { type: 'TRIVIA', questionIndex: 0, scores: { p1: 0, p2: 0 }, answered: { p1: false, p2: false } }
    case 'RPS': return { type: 'RPS', round: 1, maxRounds: 5, scores: { p1: 0, p2: 0 }, moves: { p1: null, p2: null } }
    case 'NUMBER_GUESS': return { type: 'NUMBER_GUESS', target: Math.floor(Math.random() * 100) + 1, round: 1, maxRounds: 20, history: [], currentGuesses: { p1: null, p2: null } }
    case 'TICTACTOE': return { type: 'TICTACTOE', board: Array(9).fill(null) as (string | null)[], currentTurn: 'p1', winner: null }
  }
}

const TRIVIA_QUESTIONS = [
  { q: 'What is the native gas token on Arc?', options: ['ETH', 'USDC', 'ARC', 'MATIC'], answer: 1 },
  { q: 'What does USDC stand for?', options: ['Universal Stable Digital Currency', 'US Dollar Coin', 'USD Coin', 'United States Digital Cash'], answer: 2 },
  { q: 'What company issues USDC?', options: ['Coinbase', 'Circle', 'Binance', 'Tether'], answer: 1 },
  { q: 'What is the ERC standard for fungible tokens?', options: ['ERC-721', 'ERC-1155', 'ERC-20', 'ERC-4337'], answer: 2 },
  { q: 'What does CCTP stand for?', options: ['Cross-Chain Transfer Protocol', 'Crypto Coin Transfer Program', 'Circle Cross Transfer Process', 'Chain Currency Transfer Protocol'], answer: 0 },
  { q: 'What consensus mechanism does Ethereum use after The Merge?', options: ['Proof of Work', 'Proof of Stake', 'Delegated Proof of Stake', 'Proof of Authority'], answer: 1 },
  { q: 'What is a smart contract?', options: ['A legal document stored on a server', 'Self-executing code stored on a blockchain', 'A cryptocurrency wallet', 'A type of NFT'], answer: 1 },
  { q: 'Which token standard is used for NFTs on Ethereum?', options: ['ERC-20', 'ERC-721', 'ERC-1155', 'ERC-4626'], answer: 1 },
  { q: 'What does DeFi stand for?', options: ['Decentralized Finance', 'Digital Finance', 'Distributed Fiat', 'Defined Finance'], answer: 0 },
  { q: 'What is a blockchain gas fee?', options: ['A fee paid to miners/validators to process transactions', 'A subscription fee for using a blockchain', 'A fee paid to the token issuer', 'A tax on crypto profits'], answer: 0 },
  { q: 'What does EVM stand for?', options: ['Ethereum Virtual Machine', 'Electronic Value Mechanism', 'Encrypted Value Manager', 'Ethereum Verification Module'], answer: 0 },
  { q: 'What is the maximum supply of Bitcoin?', options: ['100 million', '21 million', '10 million', 'Unlimited'], answer: 1 },
  { q: 'What is a seed phrase used for?', options: ['Mining new tokens', 'Recovering a crypto wallet', 'Signing smart contracts', 'Paying gas fees'], answer: 1 },
  { q: 'Which blockchain is Arc built on top of?', options: ['Ethereum', 'Solana', 'Circle\'s own EVM chain', 'Polygon'], answer: 2 },
  { q: 'What does DAO stand for?', options: ['Decentralized Autonomous Organization', 'Digital Asset Offering', 'Distributed Accounting Operation', 'Delegated Approval Office'], answer: 0 },
  { q: 'What is an AMM in DeFi?', options: ['Automated Market Maker', 'Asset Management Module', 'Algorithmic Mining Method', 'Approved Minting Mechanism'], answer: 0 },
  { q: 'What is the purpose of a liquidity pool?', options: ['To store NFTs', 'To enable decentralized token swaps', 'To validate blockchain transactions', 'To issue stablecoins'], answer: 1 },
  { q: 'What does TVL stand for in DeFi?', options: ['Total Value Locked', 'Token Velocity Limit', 'Transaction Volume Ledger', 'Total Verified Liquidity'], answer: 0 },
  { q: 'What is a cold wallet?', options: ['A wallet with low balance', 'An offline hardware wallet for secure storage', 'A wallet on a slow blockchain', 'A deprecated wallet address'], answer: 1 },
  { q: 'What is the role of a blockchain oracle?', options: ['To mine new blocks', 'To bring real-world data onto the blockchain', 'To validate wallet addresses', 'To issue stablecoins'], answer: 1 },
]

export function GameRoom({ address, roomId, gameType, wagerAmount, isPlayer1, opponentAddress, isPrivate, isMatchmaking, onLeave }: GameRoomProps) {
  const [txPhase, setTxPhase] = useState<TxPhase>('idle')
  const [copied, setCopied] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [localWinner, setLocalWinner] = useState<'me' | 'opponent' | 'draw' | null>(null)
  const [opponentReady, setOpponentReady] = useState(false)
  // The real on-chain roomId — set after createRoom tx confirms (P1), or received via Ably (P2)
  const [onChainRoomId, setOnChainRoomId] = useState<string>(roomId)
  // For matchmaking P2: track whether we received the real roomId from P1 yet
  const [p1RoomIdReceived, setP1RoomIdReceived] = useState(!isMatchmaking || isPlayer1)
  // Derive PIN from the confirmed on-chain roomId
  const roomPin = (parseInt(onChainRoomId.slice(-6), 16) % 9000 + 1000).toString()
  const ablyChannelRef = useRef<{ publish: (name: string, data: unknown) => Promise<unknown>; unsubscribe: () => void } | null>(null)
  const ablyReadyRef = useRef(false)

  const wagerFloat = Math.max(0, parseFloat(wagerAmount) || 0)
  const wagerBigInt = parseUnits(wagerFloat.toFixed(6), USDC_DECIMALS)
  const myRole: 'p1' | 'p2' = isPlayer1 ? 'p1' : 'p2'
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })

  // Allowance check
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: [address as `0x${string}`, CONTRACT_ADDRESS], chainId: ARC_TESTNET_CHAIN_ID,
  })
  const hasAllowance = allowance !== undefined && allowance >= wagerBigInt

  // Wagmi hooks
  const { writeContract: approveUsdc, data: approveHash, isPending: isApproving, error: approveError } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: createRoom, data: createHash, isPending: isCreating, error: createError } = useWriteContract()
  const { isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash })
  const { writeContract: joinRoomOnChain, data: joinHash, isPending: isJoining, error: joinError } = useWriteContract()
  const { isSuccess: joinSuccess } = useWaitForTransactionReceipt({ hash: joinHash })

  // Surface wallet errors — only show once per error (not on mount from stale wagmi cache)
  const shownApproveError = useRef<string | null>(null)
  const shownCreateError = useRef<string | null>(null)
  const shownJoinError = useRef<string | null>(null)
  useEffect(() => {
    if (approveError && approveError.message !== shownApproveError.current) {
      shownApproveError.current = approveError.message
      toast.error(`Approve failed: ${approveError.message.slice(0, 80)}`)
      setTxPhase('idle')
    }
  }, [approveError])
  useEffect(() => {
    if (createError && createError.message !== shownCreateError.current) {
      shownCreateError.current = createError.message
      toast.error(`Create room failed: ${createError.message.slice(0, 80)}`)
      setTxPhase('approved')
    }
  }, [createError])
  useEffect(() => {
    if (joinError && joinError.message !== shownJoinError.current) {
      shownJoinError.current = joinError.message
      toast.error(`Join failed: ${joinError.message.slice(0, 80)}`)
      setTxPhase('approved')
    }
  }, [joinError])

  const processedApprove = useRef<string | undefined>(undefined)
  const processedCreate = useRef<string | undefined>(undefined)
  const processedJoin = useRef<string | undefined>(undefined)

  // Auto-advance to 'approved' if allowance already covers the wager — skip the approve step
  useEffect(() => {
    if (hasAllowance && txPhase === 'idle') setTxPhase('approved')
  }, [hasAllowance, txPhase])

  // Matchmaking P2: listen on the server roomId for P1's room_created broadcast
  useEffect(() => {
    if (!isMatchmaking || isPlayer1 || !address || !address.startsWith('0x')) return
    const client = getAbly(address)
    const bootstrapCh = client.channels.get(`room:${roomId}`)
    void bootstrapCh.subscribe('room_created', (msg) => {
      const { realRoomId } = msg.data as { realRoomId: string }
      setOnChainRoomId(realRoomId)
      setP1RoomIdReceived(true)
    })
    return () => { bootstrapCh.unsubscribe('room_created') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect to Ably room channel — resubscribe whenever onChainRoomId resolves
  useEffect(() => {
    if (!onChainRoomId || !address || !address.startsWith('0x')) return
    ablyReadyRef.current = false

    const client = getAbly(address)
    const channelName = `room:${onChainRoomId}`
    const ch = client.channels.get(channelName)

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

    // Receive opponent's individual move and merge into local state
    void ch.subscribe('player_move', (msg) => {
      const { role, action, ...data } = msg.data as { role: 'p1' | 'p2'; action: string; [k: string]: unknown }
      setGameState(prev => {
        if (!prev) return prev
        if (prev.type === 'TRIVIA' && action === 'answer') {
          const s = prev
          const newScores = { ...s.scores }
          if (data.correct) newScores[role]++
          return { ...s, answered: { ...s.answered, [role]: true }, scores: newScores }
        }
        if (prev.type === 'RPS' && action === 'choice') {
          const s = prev
          return { ...s, moves: { ...s.moves, [role]: data.choice as string } }
        }
        if (prev.type === 'NUMBER_GUESS' && action === 'guess') {
          const s = prev
          return { ...s, currentGuesses: { ...s.currentGuesses, [role]: data.guess as number } }
        }
        return prev
      })
    })

    ablyChannelRef.current = {
      publish: (name: string, data: unknown) => ch.publish(name, data),
      unsubscribe: () => { ch.unsubscribe() },
    }
    ablyReadyRef.current = true

    return () => {
      ch.unsubscribe()
      ablyChannelRef.current = null
      ablyReadyRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainRoomId, address])

  // Approve confirmed
  useEffect(() => {
    if (approveHash && approveSuccess && processedApprove.current !== approveHash) {
      processedApprove.current = approveHash
      setTxPhase('approved')
    }
  }, [approveHash, approveSuccess])

  // Create room confirmed — derive real roomId from block timestamp, then notify backend
  useEffect(() => {
    if (!createHash || !createSuccess || !createReceipt || processedCreate.current === createHash) return
    processedCreate.current = createHash
    void (async () => {
      // The contract computes: roomId = keccak256(abi.encodePacked(salt, msg.sender, block.timestamp))
      // We know salt (pad(roomId,32)), msg.sender (address), and can get block.timestamp from the RPC
      let realRoomId = roomId
      if (publicClient) {
        try {
          const block = await publicClient.getBlock({ blockNumber: createReceipt.blockNumber })
          const saltBytes = pad(roomId as `0x${string}`, { size: 32 })
          // Import keccak256 + encodePacked inline to reproduce contract logic
          const { keccak256: keccak, encodePacked: encode } = await import('viem')
          realRoomId = keccak(encode(
            ['bytes32', 'address', 'uint256'],
            [saltBytes, address as `0x${string}`, block.timestamp]
          ))
        } catch { /* use original roomId as fallback */ }
      }
      setOnChainRoomId(realRoomId)
      // For matchmaking: broadcast real roomId to P2 on the bootstrap channel
      if (isMatchmaking) {
        const client = getAbly(address ?? '')
        void client.channels.get(`room:${roomId}`).publish('room_created', { realRoomId })
      }
      void fetch('/api/create-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, wagerAmount, isPrivate, player1: address, onChainRoomId: realRoomId }),
      }).catch(() => null)
      setTxPhase('waiting_opponent')
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createHash, createSuccess, createReceipt])

  // Join room confirmed — notify backend, signal ready, start game locally
  useEffect(() => {
    if (joinHash && joinSuccess && processedJoin.current !== joinHash) {
      processedJoin.current = joinHash
      // Notify backend player2 joined — use the real on-chain roomId
      void fetch('/api/join-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onChainRoomId, player2: address }),
      })
      // Player2: request the canonical game state from Player1 via Ably
      // Signal player1 — retry until Ably channel is ready
      const tryPublish = (attempts: number) => {
        if (ablyReadyRef.current && ablyChannelRef.current) {
          // Ask Player1 to send the canonical state (important for NUMBER_GUESS target)
          void ablyChannelRef.current.publish('opponent_ready', { player2: address })
        } else if (attempts > 0) {
          setTimeout(() => tryPublish(attempts - 1), 500)
        }
      }
      tryPublish(10)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinHash, joinSuccess])

  // P1 only: after receiving P2's move, check if resolution is needed
  useEffect(() => {
    if (!isPlayer1 || !gameState || txPhase !== 'game_active') return
    if (gameState.type === 'NUMBER_GUESS') {
      const s = gameState
      const { p1, p2 } = s.currentGuesses
      if (p1 !== null && p2 !== null) {
        // Both guessed this round — check for exact hit or advance round
        const newHistory = [...s.history, { p1, p2 }]
        // Exact win
        const p1Exact = p1 === s.target
        const p2Exact = p2 === s.target
        if (p1Exact || p2Exact) {
          const w = p1Exact && !p2Exact ? 'p1' : p2Exact && !p1Exact ? 'p2' : null
          const final: NumberState = { ...s, history: newHistory, currentGuesses: { p1, p2 } }
          resolveWinner(w, final)
          return
        }
        // Last round — resolve by total closest distance across all rounds
        if (s.round >= s.maxRounds) {
          const allRounds = newHistory
          const totalD1 = allRounds.reduce((acc, r) => acc + Math.abs((r.p1 ?? 0) - s.target), 0)
          const totalD2 = allRounds.reduce((acc, r) => acc + Math.abs((r.p2 ?? 0) - s.target), 0)
          const w = totalD1 < totalD2 ? 'p1' : totalD2 < totalD1 ? 'p2' : null
          const final: NumberState = { ...s, history: newHistory, currentGuesses: { p1, p2 } }
          resolveWinner(w, final)
          return
        }
        // Advance to next round
        const next: NumberState = { ...s, round: s.round + 1, history: newHistory, currentGuesses: { p1: null, p2: null } }
        setGameState(next)
        void ablyChannelRef.current?.publish('game_state', next)
      }
    }
    if (gameState.type === 'TRIVIA') {
      const s = gameState
      if (s.answered.p1 && s.answered.p2) {
        const next = s.questionIndex + 1
        if (next >= TRIVIA_QUESTIONS.length) {
          const w = s.scores.p1 > s.scores.p2 ? 'p1' : s.scores.p2 > s.scores.p1 ? 'p2' : null
          resolveWinner(w, s)
        } else {
          const reset: TriviaState = { ...s, questionIndex: next, answered: { p1: false, p2: false } }
          setGameState(reset)
          void ablyChannelRef.current?.publish('game_state', reset)
        }
      }
    }
    if (gameState.type === 'RPS') {
      const s = gameState
      if (s.moves.p1 && s.moves.p2) {
        const wins: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
        const newScores = { ...s.scores }
        if (s.moves.p1 !== s.moves.p2) {
          if (wins[s.moves.p1] === s.moves.p2) newScores.p1++; else newScores.p2++
        }
        const round = s.round + 1
        const roundState: RPSState = { ...s, scores: newScores }
        if (round > s.maxRounds || newScores.p1 > 2 || newScores.p2 > 2) {
          const w = newScores.p1 > newScores.p2 ? 'p1' : newScores.p2 > newScores.p1 ? 'p2' : null
          resolveWinner(w, roundState)
        } else {
          const next: RPSState = { ...roundState, round, moves: { p1: null, p2: null } }
          setGameState(next)
          void ablyChannelRef.current?.publish('game_state', next)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState])

  // Player1: when opponent_ready fires, create canonical state and send to both
  useEffect(() => {
    if (isPlayer1 && opponentReady && txPhase === 'waiting_opponent') {
      const gs = initLocalState(gameType)
      setGameState(gs)
      setTxPhase('game_active')
      // Send canonical state to Player2 — ensures both use same NUMBER_GUESS target etc.
      const tryPublish = (attempts: number) => {
        if (ablyChannelRef.current) {
          void ablyChannelRef.current.publish('game_start', gs)
        } else if (attempts > 0) {
          setTimeout(() => tryPublish(attempts - 1), 300)
        }
      }
      tryPublish(10)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer1, opponentReady, txPhase, gameType])

  const handleApprove = useCallback(() => {
    setTxPhase('approving')
    // Passing chainId triggers wagmi to auto-prompt a chain switch in MetaMask if needed
    approveUsdc({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
      args: [CONTRACT_ADDRESS, wagerBigInt], chainId: ARC_TESTNET_CHAIN_ID })
  }, [approveUsdc, wagerBigInt])

  const handleCreateRoom = useCallback(() => {
    if (!CONTRACT_ADDRESS) { toast.error('Contract address not configured'); return }
    const saltBytes = pad(roomId as `0x${string}`, { size: 32 })
    const gameTypeIndex = ['TRIVIA', 'RPS', 'NUMBER_GUESS', 'TICTACTOE'].indexOf(gameType)
    setTxPhase('creating_room')
    createRoom({ address: CONTRACT_ADDRESS, abi: WAGER_GAME_ABI, functionName: 'createRoom',
      args: [gameTypeIndex, wagerBigInt, isPrivate, saltBytes],
      chainId: ARC_TESTNET_CHAIN_ID })
  }, [createRoom, roomId, gameType, wagerBigInt, isPrivate])

  const handleJoinRoom = useCallback(() => {
    // Use onChainRoomId — this is the exact roomId the contract stored (resolved from server/Ably)
    joinRoomOnChain({ address: CONTRACT_ADDRESS, abi: WAGER_GAME_ABI, functionName: 'joinRoom',
      args: [onChainRoomId as `0x${string}`], chainId: ARC_TESTNET_CHAIN_ID })
  }, [joinRoomOnChain, onChainRoomId])

  // Resolve winner — only called by P1 after full state is known
  const resolveWinner = useCallback((w: 'p1' | 'p2' | null, finalState: GameState) => {
    setLocalWinner(w === null ? 'draw' : w === myRole ? 'me' : 'opponent')
    setTxPhase('game_over')
    void ablyChannelRef.current?.publish('game_over', { state: finalState, winner: w })
    if (w) void fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: onChainRoomId, winner: w === 'p1' ? address : opponentAddress }) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRole, address, opponentAddress, onChainRoomId])

  // Handle a game move — each player publishes their own move; P1 resolves when both moves in
  const handleGameAction = useCallback((action: string, payload: unknown) => {
    if (!gameState) return

    if (gameState.type === 'TRIVIA' && action === 'answer') {
      const state = gameState
      const correct = (payload as { answerIndex: number }).answerIndex === TRIVIA_QUESTIONS[state.questionIndex].answer
      // Publish my move — opponent's Ably listener will merge it in via game_state
      void ablyChannelRef.current?.publish('player_move', { role: myRole, action: 'answer', correct })
      const newAnswered = { ...state.answered, [myRole]: true }
      const newScores = { ...state.scores }
      if (correct) newScores[myRole]++
      const newState: TriviaState = { ...state, answered: newAnswered, scores: newScores }
      if (newAnswered.p1 && newAnswered.p2) {
        const next = state.questionIndex + 1
        if (next >= TRIVIA_QUESTIONS.length) {
          const w = newScores.p1 > newScores.p2 ? 'p1' : newScores.p2 > newScores.p1 ? 'p2' : null
          setGameState(newState)
          if (isPlayer1) resolveWinner(w, newState)
        } else {
          const reset: TriviaState = { ...newState, questionIndex: next, answered: { p1: false, p2: false } }
          setGameState(reset)
          if (isPlayer1) void ablyChannelRef.current?.publish('game_state', reset)
        }
      } else {
        setGameState(newState)
        void ablyChannelRef.current?.publish('game_state', newState)
      }
      return
    }

    if (gameState.type === 'RPS' && action === 'choice') {
      const state = gameState
      const choice = (payload as { choice: string }).choice
      void ablyChannelRef.current?.publish('player_move', { role: myRole, action: 'choice', choice })
      const newMoves = { ...state.moves, [myRole]: choice }
      const newState: RPSState = { ...state, moves: newMoves }
      if (newMoves.p1 && newMoves.p2) {
        const newScores = { ...state.scores }
        const wins: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
        if (newMoves.p1 !== newMoves.p2) {
          if (wins[newMoves.p1] === newMoves.p2) newScores.p1++; else newScores.p2++
        }
        const round = state.round + 1
        const roundState: RPSState = { ...newState, scores: newScores }
        if (round > state.maxRounds || newScores.p1 > 2 || newScores.p2 > 2) {
          const w = newScores.p1 > newScores.p2 ? 'p1' : newScores.p2 > newScores.p1 ? 'p2' : null
          setGameState(roundState)
          if (isPlayer1) resolveWinner(w, roundState)
        } else {
          const next: RPSState = { ...roundState, round, moves: { p1: null, p2: null } }
          setGameState(next)
          if (isPlayer1) void ablyChannelRef.current?.publish('game_state', next)
        }
      } else {
        setGameState(newState)
        void ablyChannelRef.current?.publish('game_state', newState)
      }
      return
    }

    if (gameState.type === 'NUMBER_GUESS' && action === 'guess') {
      const state = gameState
      if (state.currentGuesses[myRole] !== null) return  // already guessed this round
      const guess = (payload as { guess: number }).guess
      void ablyChannelRef.current?.publish('player_move', { role: myRole, action: 'guess', guess })
      const newState: NumberState = { ...state, currentGuesses: { ...state.currentGuesses, [myRole]: guess } }
      setGameState(newState)
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
      void ablyChannelRef.current?.publish('game_state', newState)
      if (tttWinner || isDraw) {
        const w = tttWinner as 'p1' | 'p2' | null ?? null
        setGameState(newState)
        resolveWinner(w, newState)
      } else {
        setGameState(newState)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, myRole, isPlayer1, resolveWinner])

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

      {/* ── MATCHMAKING: single approve+play card for both players ── */}
      {isMatchmaking && (txPhase === 'idle' || txPhase === 'approving') && (
        <StepCard step={1} active>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{isPlayer1 ? 'Lock Wager & Create Room' : 'Lock Wager & Join'}</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Opponent found! Lock your {wagerAmount} USDC to start.</p>
          <button onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove} disabled={isApproving}
            className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {isApproving ? 'Confirm in wallet...' : hasAllowance ? 'Allowance ready — continue' : `Approve ${wagerAmount} USDC`}
          </button>
        </StepCard>
      )}

      {/* ── MATCHMAKING: auto-create/join after approve ── */}
      {isMatchmaking && txPhase === 'approved' && (
        <StepCard step={2} active>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{isPlayer1 ? 'Create Room on-chain' : 'Join Room on-chain'}</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {!isPlayer1 && !p1RoomIdReceived ? 'Waiting for opponent to create room...' : `Lock your ${wagerAmount} USDC wager`}
          </p>
          <button onClick={isPlayer1 ? handleCreateRoom : handleJoinRoom}
            disabled={isCreating || isJoining || (!isPlayer1 && !p1RoomIdReceived)}
            className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {(isCreating || isJoining) ? 'Confirm in wallet...'
              : (!isPlayer1 && !p1RoomIdReceived) ? 'Waiting for opponent...'
              : isPlayer1 ? 'Create & Play' : 'Join & Play'}
          </button>
        </StepCard>
      )}

      {/* ── MATCHMAKING: waiting for P2 to join after P1 creates ── */}
      {isMatchmaking && isPlayer1 && (txPhase === 'creating_room' || txPhase === 'waiting_opponent') && (
        <div className="flex items-center justify-center gap-2 rounded-2xl py-5" style={{ background: 'var(--surface-muted)' }}>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {txPhase === 'creating_room' ? 'Confirming on-chain...' : 'Waiting for opponent to lock wager...'}
          </p>
        </div>
      )}

      {/* ── PRIVATE ROOM PLAYER 1: Step 1 — Approve ── */}
      {!isMatchmaking && isPlayer1 && (txPhase === 'idle' || txPhase === 'approving') && (
        <div className="space-y-3">
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
        </div>
      )}

      {/* ── PRIVATE ROOM PLAYER 1: Step 2 — Create Room ── */}
      {!isMatchmaking && isPlayer1 && txPhase === 'approved' && (
        <div className="space-y-3">
          <StepCard step={1} done><p className="text-sm" style={{ color: 'var(--success)' }}>USDC approved</p></StepCard>
          <StepCard step={2} active>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Create Room on-chain</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Your room code will be: <span className="font-black text-lg" style={{ color: 'var(--accent)' }}>{roomPin}</span></p>
            <button onClick={handleCreateRoom} disabled={isCreating}
              className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
              {isCreating ? 'Confirm in wallet...' : 'Create Room'}
            </button>
          </StepCard>
        </div>
      )}

      {/* ── PRIVATE ROOM PLAYER 1: Step 3 — Waiting ── */}
      {!isMatchmaking && isPlayer1 && (txPhase === 'creating_room' || txPhase === 'waiting_opponent') && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)', border: '2px solid var(--accent)' }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Your Room Code</p>
            <div className="flex items-center justify-between gap-3">
              <p className="mono text-5xl font-black tracking-[0.2em]" style={{ color: 'var(--ink)' }}>{roomPin}</p>
              <button onClick={copyCode} className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Share this 4-digit code with your opponent</p>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-2xl py-4" style={{ background: 'var(--surface-muted)' }}>
            {txPhase === 'creating_room'
              ? <><div className="h-5 w-5 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--accent)' }} /><p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Confirming on-chain...</p></>
              : <><div className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} /><p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Waiting for opponent to join...</p></>
            }
          </div>
        </div>
      )}

      {/* ── PRIVATE ROOM PLAYER 2: Step 1 — Approve ── */}
      {!isMatchmaking && !isPlayer1 && (txPhase === 'idle' || txPhase === 'approving') && (
        <StepCard step={1} active>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Approve USDC</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Allow the contract to hold your {wagerAmount} USDC wager</p>
          <button onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove} disabled={isApproving}
            className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {isApproving ? 'Confirm in wallet...' : hasAllowance ? 'Already approved — continue' : `Approve ${wagerAmount} USDC`}
          </button>
        </StepCard>
      )}

      {/* ── PRIVATE ROOM PLAYER 2: Step 2 — Join ── */}
      {!isMatchmaking && !isPlayer1 && txPhase === 'approved' && (
        <StepCard step={2} active>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Join Room on-chain</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Lock your {wagerAmount} USDC wager and start the game</p>
          <button onClick={handleJoinRoom} disabled={isJoining}
            className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {isJoining ? 'Confirm in wallet...' : 'Join & Start Game'}
          </button>
        </StepCard>
      )}

      {/* ── ACTIVE GAME ── */}
      {txPhase === 'game_active' && gameState && (
        <div>
          {gameState.type === 'TRIVIA' && (
            <TriviaGame state={gameState} myRole={myRole} questions={TRIVIA_QUESTIONS} onAnswer={(i) => handleGameAction('answer', { answerIndex: i })} />
          )}
          {gameState.type === 'RPS' && (
            <RPSGame state={gameState} myRole={myRole} onChoice={(c) => handleGameAction('choice', { choice: c })} />
          )}
          {gameState.type === 'NUMBER_GUESS' && (
            <NumberGuessGame state={gameState} myRole={myRole} onGuess={(g) => handleGameAction('guess', { guess: g })} />
          )}
          {gameState.type === 'TICTACTOE' && (
            <TicTacToeGame state={gameState} myRole={myRole} onMove={(i) => handleGameAction('move', { index: i })} />
          )}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {txPhase === 'game_over' && (
        <div className="space-y-4">
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
        </div>
      )}
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, CheckCircle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { useAblyGame } from '../hooks/useAblyGame'
import { TriviaGame } from './games/TriviaGame'
import { RPSGame } from './games/RPSGame'
import { NumberGuessGame } from './games/NumberGuessGame'
import { TicTacToeGame } from './games/TicTacToeGame'
import type { Room, GameType } from '../hooks/useGameServer'
import WAGER_ARTIFACT from '../../contracts/out/WagerGame.sol/WagerGame.json'

const ARC_TESTNET_CHAIN_ID = 5042002
const USDC_FACT = getUsdc(ARC_TESTNET_CHAIN_ID)!
const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
const USDC_DECIMALS = USDC_FACT.decimals

// Loaded from .env — user must paste their deployed contract address
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

export function GameRoom({
  address, chainId, roomId, gameType, wagerAmount, isPlayer1, opponentAddress, isPrivate, onLeave
}: GameRoomProps) {
  const { send, on, subscribeToRoom, subscribeToPlayer } = useAblyGame(address)
  const [room, setRoom] = useState<Room | null>(null)
  const [txPhase, setTxPhase] = useState<TxPhase>('idle')
  const [copied, setCopied] = useState(false)

  const wagerBigInt = parseUnits(wagerAmount, USDC_DECIMALS)
  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  // Approve USDC spend
  const { writeContract: approveUsdc, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Check current allowance
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as `0x${string}`, CONTRACT_ADDRESS],
    chainId: ARC_TESTNET_CHAIN_ID,
  })

  const hasAllowance = allowance !== undefined && allowance >= wagerBigInt

  // Create room on-chain
  const { writeContract: createRoom, data: createHash, isPending: isCreating } = useWriteContract()
  const { isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash })

  // Join room on-chain (player2)
  const { writeContract: joinRoomOnChain, data: joinHash, isPending: isJoining } = useWriteContract()
  const { isSuccess: joinSuccess, data: joinReceipt } = useWaitForTransactionReceipt({ hash: joinHash })

  // Subscribe to Ably channels and listen for game events
  useEffect(() => {
    if (!address) return
    subscribeToRoom(roomId)
    subscribeToPlayer(address)

    const unsub1 = on('room_created', (msg) => {
      setRoom(msg.room as Room)
      setTxPhase('waiting_opponent')
    })
    const unsub2 = on('room_state', (msg) => {
      setRoom(msg.room as Room)
      if ((msg.room as Room).status === 'ACTIVE') setTxPhase('game_active')
    })
    const unsub3 = on('game_started', (msg) => {
      setRoom(msg.room as Room)
      setTxPhase('game_active')
    })
    const unsub4 = on('game_state', (msg) => {
      setRoom(msg.room as Room)
    })
    const unsub5 = on('game_finished', (msg) => {
      setRoom(msg.room as Room)
      setTxPhase('game_over')
    })

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, roomId])

  // Track processed tx hashes to avoid re-triggering
  const processedApprove = useRef<string | undefined>(undefined)
  const processedCreate = useRef<string | undefined>(undefined)
  const processedJoin = useRef<string | undefined>(undefined)

  // Derive phase transitions from wagmi state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (approveHash && approveSuccess && processedApprove.current !== approveHash) {
      processedApprove.current = approveHash
      setTxPhase('approved')
    }
  }, [approveHash, approveSuccess])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (createHash && createSuccess && createReceipt && processedCreate.current !== createHash) {
      processedCreate.current = createHash
      // Notify WS backend — best-effort, not required for code display
      void send({
        type: 'create_room',
        roomId,
        address,
        gameType,
        wagerAmount,
        isPrivate,
        salt: roomId,
      })
      // Always transition locally so the code shows even without a WS server
      setTxPhase('waiting_opponent')
    }
  }, [createHash, createSuccess, createReceipt])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (joinHash && joinSuccess && joinReceipt && processedJoin.current !== joinHash) {
      processedJoin.current = joinHash
      void send({ type: 'player_joined', roomId, address })
    }
  }, [joinHash, joinSuccess, joinReceipt])

  const handleApprove = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    setTxPhase('approving')
    approveUsdc({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, wagerBigInt],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }, [isWrongChain, approveUsdc, wagerBigInt])

  const handleCreateRoom = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    const saltBytes = `0x${roomId.replace('0x', '')}`
    createRoom({
      address: CONTRACT_ADDRESS,
      abi: WAGER_ARTIFACT.abi,
      functionName: 'createRoom',
      args: [
        ['TRIVIA', 'RPS', 'NUMBER_GUESS', 'TICTACTOE'].indexOf(gameType),
        wagerBigInt,
        isPrivate,
        saltBytes,
      ],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
    setTxPhase('creating_room')
  }, [isWrongChain, createRoom, roomId, gameType, wagerBigInt, isPrivate])

  const handleJoinRoom = useCallback(() => {
    if (isWrongChain) { toast.error('Switch to Arc Testnet first'); return }
    joinRoomOnChain({
      address: CONTRACT_ADDRESS,
      abi: WAGER_ARTIFACT.abi,
      functionName: 'joinRoom',
      args: [roomId as `0x${string}`],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }, [isWrongChain, joinRoomOnChain, roomId])

  const handleGameAction = useCallback((action: string, payload: unknown) => {
    void send({ type: 'game_action', roomId, address, action, payload })
  }, [send, roomId, address])

  const copyCode = () => {
    void navigator.clipboard.writeText(roomId)
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

  const gs = room?.gameState
  const opponent = opponentAddress

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onLeave} className="text-sm font-medium" style={{ color: 'var(--muted)' }}>← Leave</button>
        <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {gameType.replace('_', ' ')}
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: txPhase === 'game_active' ? 'var(--success)' : txPhase === 'game_over' ? 'var(--danger)' : '#f59e0b' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {txPhase === 'game_active' ? 'Live' : txPhase === 'game_over' ? 'Finished' : 'Preparing'}
          </span>
        </div>
      </div>

      {/* Wager display */}
      <div
        className="relative overflow-hidden rounded-2xl p-4"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
        <p className="text-xs opacity-75">Prize Pool</p>
        <p className="display text-3xl font-bold tabular-nums">{(parseFloat(wagerAmount) * 2 * 0.98).toFixed(2)} <span className="text-lg">USDC</span></p>
        <p className="mt-0.5 text-xs opacity-60">{wagerAmount} each · 2% platform fee</p>
      </div>

      {/* Onboarding flow for player1 */}
      <AnimatePresence mode="wait">
        {isPlayer1 && txPhase === 'idle' && (
          <motion.div key="approve" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <StepCard step={1} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Approve USDC</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Allow the contract to hold your {wagerAmount} USDC wager</p>
              <button
                onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove}
                disabled={isApproving}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {isApproving ? 'Confirm in wallet...' : hasAllowance ? 'Already approved — continue' : `Approve ${wagerAmount} USDC`}
              </button>
            </StepCard>
            <StepCard step={2}><p className="text-sm" style={{ color: 'var(--muted)' }}>Create room on-chain</p></StepCard>
            <StepCard step={3}><p className="text-sm" style={{ color: 'var(--muted)' }}>Share code and wait for opponent</p></StepCard>
          </motion.div>
        )}

        {isPlayer1 && txPhase === 'approved' && (
          <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <StepCard step={1} done><p className="text-sm" style={{ color: 'var(--success)' }}>USDC approved</p></StepCard>
            <StepCard step={2} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Create room on-chain</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>This locks your wager in the smart contract</p>
              <button
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {isCreating ? 'Confirm in wallet...' : 'Create Room'}
              </button>
            </StepCard>
          </motion.div>
        )}

        {isPlayer1 && txPhase === 'creating_room' && (
          <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Show code early for private rooms so player can share while tx confirms */}
            {isPrivate && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Your Room Code</p>
                <div className="flex items-center gap-2">
                  <p className="mono flex-1 overflow-hidden text-ellipsis text-xs" style={{ color: 'var(--ink)' }}>{roomId}</p>
                  <button
                    onClick={copyCode}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Share this with your friend — you can copy now while the transaction confirms</p>
              </div>
            )}
            <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--accent)' }} />
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Waiting for confirmation...</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Transaction is being confirmed on Arc Testnet</p>
            </div>
          </motion.div>
        )}

        {isPlayer1 && txPhase === 'waiting_opponent' && (
          <motion.div key="waiting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Always show room code once confirmed — private AND public so player can share/track */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                {isPrivate ? 'Your Room Code' : 'Room ID'}
              </p>
              <div className="flex items-center gap-2">
                <p className="mono flex-1 overflow-hidden text-ellipsis text-xs" style={{ color: 'var(--ink)' }}>{roomId}</p>
                <button
                  onClick={copyCode}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                {isPrivate
                  ? 'Share this code with your friend to let them join'
                  : 'Waiting for a random opponent to match with you'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-2xl py-4" style={{ background: 'var(--surface-muted)' }}>
              <div className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Waiting for opponent to join...</p>
            </div>
          </motion.div>
        )}

        {/* Player 2 flow */}
        {!isPlayer1 && txPhase === 'idle' && (
          <motion.div key="p2-idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <StepCard step={1} active>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Approve USDC</p>
              <button
                onClick={hasAllowance ? () => setTxPhase('approved') : handleApprove}
                disabled={isApproving}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
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
              <button
                onClick={handleJoinRoom}
                disabled={isJoining}
                className="mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {isJoining ? 'Confirm in wallet...' : 'Join & Lock Wager'}
              </button>
            </StepCard>
          </motion.div>
        )}

        {/* Active Game */}
        {txPhase === 'game_active' && gs && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {gs.type === 'TRIVIA' && (
              <TriviaGame
                state={gs}
                myAddress={address}
                opponentAddress={opponent}
                onAnswer={(i) => handleGameAction('answer', { answerIndex: i })}
              />
            )}
            {gs.type === 'RPS' && (
              <RPSGame
                state={gs}
                myAddress={address}
                opponentAddress={opponent}
                onChoice={(c) => handleGameAction('choice', { choice: c })}
              />
            )}
            {gs.type === 'NUMBER_GUESS' && (
              <NumberGuessGame
                state={gs}
                myAddress={address}
                opponentAddress={opponent}
                onGuess={(g) => handleGameAction('guess', { guess: g })}
              />
            )}
            {gs.type === 'TICTACTOE' && (
              <TicTacToeGame
                state={gs}
                myAddress={address}
                opponentAddress={opponent}
                onMove={(i) => handleGameAction('move', { index: i })}
              />
            )}
          </motion.div>
        )}

        {/* Game Over */}
        {txPhase === 'game_over' && room && (
          <motion.div
            key="over"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div
              className="relative overflow-hidden rounded-2xl p-6 text-center"
              style={{
                background: room.winner === address ? 'var(--success)' : room.winner === null ? 'var(--surface-muted)' : 'var(--danger)',
                color: 'white',
              }}
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
              <p className="display mb-1 text-4xl font-bold">
                {room.winner === address ? 'You Won!' : room.winner === null ? 'Draw!' : 'You Lost'}
              </p>
              {room.winner === address && (
                <p className="text-lg font-semibold opacity-90">
                  +{(parseFloat(wagerAmount) * 2 * 0.98).toFixed(2)} USDC
                </p>
              )}
              {room.winner === null && (
                <p className="opacity-75">Both players refunded</p>
              )}
            </div>
            {createHash && (
              <a
                href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, createHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                <ExternalLink size={14} />
                View on explorer
              </a>
            )}
            <button
              onClick={onLeave}
              className="w-full rounded-2xl py-4 font-semibold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
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
    <div
      className="flex gap-4 rounded-2xl p-4"
      style={{
        background: active ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(16px)',
        border: active ? '2px solid var(--accent)' : '1.5px solid rgba(255,255,255,0.8)',
        opacity: done ? 0.7 : 1,
      }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{
          background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface-muted)',
          color: done || active ? 'white' : 'var(--muted)',
        }}
      >
        {done ? '✓' : step}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

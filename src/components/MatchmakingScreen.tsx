import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shuffle } from 'lucide-react'
import { useAblyMatchmaking } from '../hooks/useAblyGame'
import type { GameType } from '../hooks/useGameServer'

interface MatchmakingScreenProps {
  address: string
  gameType: GameType
  wagerAmount: string
  salt: string
  onMatchFound: (roomId: string, role: string, opponent: string) => void
  onCancel: () => void
}

const GAME_LABELS: Record<GameType, string> = {
  TRIVIA: 'Trivia',
  RPS: 'Rock Paper Scissors',
  NUMBER_GUESS: 'Number Duel',
  TICTACTOE: 'Tic-Tac-Toe',
}

export function MatchmakingScreen({ address, gameType, wagerAmount, onMatchFound, onCancel }: MatchmakingScreenProps) {
  const { status, matchedRoom, startMatchmaking, cancelMatchmaking } = useAblyMatchmaking(address)

  // Start matchmaking on mount
  useEffect(() => {
    void startMatchmaking(gameType, wagerAmount)
    return () => { void cancelMatchmaking(gameType, wagerAmount) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Navigate when matched
  useEffect(() => {
    if (status === 'matched' && matchedRoom) {
      onMatchFound(matchedRoom.roomId, matchedRoom.role, '')
    }
  }, [status, matchedRoom, onMatchFound])

  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Finding Opponent</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{GAME_LABELS[gameType]} · {wagerAmount} USDC wager</p>
      </div>

      <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute h-full w-full rounded-full"
            style={{ border: '2px solid var(--accent)', opacity: 0.3 - i * 0.08 }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.3 - i * 0.08, 0, 0.3 - i * 0.08] }}
            transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
          />
        ))}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Shuffle size={28} />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 animate-bounce rounded-full" style={{ background: 'var(--accent)', animationDelay: '0ms' }} />
          <div className="h-2 w-2 animate-bounce rounded-full" style={{ background: 'var(--accent)', animationDelay: '150ms' }} />
          <div className="h-2 w-2 animate-bounce rounded-full" style={{ background: 'var(--accent)', animationDelay: '300ms' }} />
        </div>
        <p className="mt-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>Searching for a player...</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Matching by game type and wager amount</p>
      </div>

      <button
        onClick={() => { void cancelMatchmaking(gameType, wagerAmount); onCancel() }}
        className="w-full rounded-2xl py-4 font-semibold"
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: 'var(--ink)' }}
      >
        Cancel
      </button>
    </div>
  )
}

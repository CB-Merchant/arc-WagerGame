import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shuffle } from 'lucide-react'
import { useGameServer } from '../hooks/useGameServer'
import type { GameType } from '../hooks/useGameServer'

interface MatchmakingScreenProps {
  address: string
  gameType: GameType
  wagerAmount: string
  salt: string
  onMatchFound: (roomId: string, player1: string, player2: string) => void
  onCancel: () => void
}

export function MatchmakingScreen({ address, gameType, wagerAmount, salt, onMatchFound, onCancel }: MatchmakingScreenProps) {
  const { send, on } = useGameServer(address)

  useEffect(() => {
    send({ type: 'matchmake', address, gameType, wagerAmount, salt })

    const unsub = on('match_found', (msg) => {
      const data = msg as { player1Address: string; player2Address: string; roomSalt: string }
      // roomId is computed from player1's salt
      const roomId = data.roomSalt
      onMatchFound(roomId, data.player1Address, data.player2Address)
    })

    return () => {
      unsub()
      send({ type: 'cancel_matchmake', address })
    }
  }, [address, gameType, wagerAmount, salt, send, on, onMatchFound])

  const GAME_LABELS: Record<GameType, string> = {
    TRIVIA: 'Trivia',
    RPS: 'Rock Paper Scissors',
    NUMBER_GUESS: 'Number Duel',
    TICTACTOE: 'Tic-Tac-Toe',
  }

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
        onClick={onCancel}
        className="w-full rounded-2xl py-4 font-semibold"
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: 'var(--ink)' }}
      >
        Cancel
      </button>
    </div>
  )
}

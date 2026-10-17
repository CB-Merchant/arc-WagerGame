import { motion } from 'framer-motion'
import type { RPSState } from '../../hooks/useGameServer'

interface RPSGameProps {
  state: RPSState
  myAddress: string
  opponentAddress: string
  onChoice: (choice: 'rock' | 'paper' | 'scissors') => void
}

const CHOICES: { id: 'rock' | 'paper' | 'scissors'; label: string; icon: string; beats: string }[] = [
  { id: 'rock', label: 'Rock', icon: '✊', beats: 'scissors' },
  { id: 'paper', label: 'Paper', icon: '✋', beats: 'rock' },
  { id: 'scissors', label: 'Scissors', icon: '✌️', beats: 'paper' },
]

export function RPSGame({ state, myAddress, opponentAddress, onChoice }: RPSGameProps) {
  const myChoice = state.choices[myAddress]
  const oppChoice = state.choices[opponentAddress]
  const hasChosen = myChoice !== null

  return (
    <div className="space-y-4">
      {/* Scores & Round */}
      <div className="flex gap-3">
        <ScoreCard label="You" score={state.scores[myAddress] ?? 0} isMe />
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Round</p>
          <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{state.round}<span className="text-base font-normal">/{state.maxRounds}</span></p>
        </div>
        <ScoreCard label="Opponent" score={state.scores[opponentAddress] ?? 0} />
      </div>

      {/* Round result banner */}
      {state.roundResult && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-4 text-center"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        >
          <p className="text-sm font-semibold">{state.roundResult}</p>
        </motion.div>
      )}

      {/* Choices */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          {hasChosen ? (oppChoice ? 'Both chose!' : 'Waiting for opponent...') : 'Make your choice'}
        </p>
        <div className="flex gap-3">
          {CHOICES.map((c) => {
            const isSelected = myChoice === c.id
            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.94 }}
                disabled={hasChosen}
                onClick={() => onChoice(c.id)}
                className="flex flex-1 flex-col items-center gap-2 rounded-2xl py-5 transition-all disabled:cursor-default"
                style={{
                  background: isSelected ? 'var(--accent)' : 'var(--surface-muted)',
                  border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <span className="text-3xl">{c.icon}</span>
                <span className="text-xs font-semibold" style={{ color: isSelected ? 'white' : 'var(--ink)' }}>{c.label}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Status */}
      {hasChosen && !oppChoice && (
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Opponent is thinking...</p>
        </div>
      )}
    </div>
  )
}

function ScoreCard({ label, score, isMe }: { label: string; score: number; isMe?: boolean }) {
  return (
    <div
      className="flex-1 rounded-xl p-3 text-center"
      style={{ background: isMe ? 'var(--accent)' : 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.8)' }}
    >
      <p className="text-xs font-medium" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>{label}</p>
      <p className="display text-2xl font-bold" style={{ color: isMe ? 'white' : 'var(--ink)' }}>{score}</p>
    </div>
  )
}

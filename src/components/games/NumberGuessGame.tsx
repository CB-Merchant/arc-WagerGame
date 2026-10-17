import { useState } from 'react'
import { motion } from 'framer-motion'
import type { NumberGuessState } from '../../hooks/useGameServer'

interface NumberGuessGameProps {
  state: NumberGuessState
  myAddress: string
  opponentAddress: string
  onGuess: (guess: number) => void
}

export function NumberGuessGame({ state, myAddress, opponentAddress, onGuess }: NumberGuessGameProps) {
  const [input, setInput] = useState('')
  const myGuess = state.guesses[myAddress]
  const hasGuessed = myGuess !== null

  const submit = () => {
    const n = parseInt(input)
    if (isNaN(n) || n < 1 || n > 100) return
    onGuess(n)
    setInput('')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <ScoreCard label="You" score={state.scores[myAddress] ?? 0} isMe />
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Round</p>
          <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{state.round}<span className="text-base font-normal">/{state.maxRounds}</span></p>
        </div>
        <ScoreCard label="Opponent" score={state.scores[opponentAddress] ?? 0} />
      </div>

      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
          style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }}
        />
        {state.revealed ? (
          <div>
            <p className="text-sm opacity-75">The number was</p>
            <p className="display text-5xl font-bold tabular-nums">{state.targetNumber}</p>
            <div className="mt-3 flex justify-center gap-6 text-sm">
              <div>
                <p className="opacity-75">You guessed</p>
                <p className="font-bold">{myGuess}</p>
                <p className="text-xs opacity-60">Diff: {Math.abs((myGuess ?? 0) - state.targetNumber)}</p>
              </div>
              <div>
                <p className="opacity-75">Opponent</p>
                <p className="font-bold">{state.guesses[opponentAddress] ?? '?'}</p>
                <p className="text-xs opacity-60">
                  Diff: {state.guesses[opponentAddress] !== null ? Math.abs((state.guesses[opponentAddress] ?? 0) - state.targetNumber) : '?'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-sm opacity-75">Guess the number</p>
            <p className="display text-3xl font-bold">1 — 100</p>
            <p className="mt-2 text-sm opacity-75">Closest guess wins this round</p>
          </div>
        )}
      </div>

      {!hasGuessed && !state.revealed && (
        <div className="flex gap-3">
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Enter 1–100"
            min={1}
            max={100}
            className="display flex-1 rounded-2xl px-4 py-4 text-xl font-bold outline-none tabular-nums"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: 'var(--ink)' }}
          />
          <button
            onClick={submit}
            className="rounded-2xl px-6 font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Lock
          </button>
        </div>
      )}

      {/* Quick guesses */}
      {!hasGuessed && !state.revealed && (
        <div className="flex flex-wrap gap-2">
          {[10, 25, 50, 75, 90].map((n) => (
            <button
              key={n}
              onClick={() => setInput(String(n))}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {hasGuessed && !state.revealed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-4 text-center"
          style={{ background: 'var(--surface-muted)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Locked in: <span className="display text-xl tabular-nums">{myGuess}</span></p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Waiting for opponent's guess...</p>
        </motion.div>
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

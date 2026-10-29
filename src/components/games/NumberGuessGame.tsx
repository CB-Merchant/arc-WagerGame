import { useState } from 'react'
import { motion } from 'framer-motion'

interface NumberState {
  type: 'NUMBER_GUESS'
  target: number
  guesses: { p1: number | null; p2: number | null }
}

interface NumberGuessGameProps {
  state: NumberState
  myRole: 'p1' | 'p2'
  onGuess: (guess: number) => void
}

export function NumberGuessGame({ state, myRole, onGuess }: NumberGuessGameProps) {
  const [input, setInput] = useState('')
  const oppRole = myRole === 'p1' ? 'p2' : 'p1'
  const myGuess = state.guesses[myRole]
  const oppGuess = state.guesses[oppRole]
  const hasGuessed = myGuess !== null
  const bothGuessed = myGuess !== null && oppGuess !== null

  const submit = () => {
    const n = parseInt(input)
    if (isNaN(n) || n < 1 || n > 100) { return }
    onGuess(n)
    setInput('')
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl p-5 text-center" style={{ background: 'var(--accent)', color: 'white' }}>
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
          style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
        {bothGuessed ? (
          <>
            <p className="text-sm opacity-75">The number was</p>
            <p className="display text-5xl font-bold tabular-nums">{state.target}</p>
            <div className="mt-3 flex justify-center gap-6 text-sm">
              <div>
                <p className="opacity-75">You guessed</p>
                <p className="font-bold">{myGuess}</p>
                <p className="text-xs opacity-60">Diff: {Math.abs(myGuess - state.target)}</p>
              </div>
              <div>
                <p className="opacity-75">Opponent</p>
                <p className="font-bold">{oppGuess}</p>
                <p className="text-xs opacity-60">Diff: {Math.abs(oppGuess - state.target)}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm opacity-75 mb-1">Guess a number</p>
            <p className="display text-2xl font-bold">1 – 100</p>
            <p className="text-xs opacity-60 mt-1">Closest to the secret number wins</p>
          </>
        )}
      </div>

      {!hasGuessed && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
          <div className="flex gap-3">
            <input
              type="number" min={1} max={100}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Enter 1–100"
              className="mono flex-1 rounded-xl bg-transparent p-3 text-2xl font-bold outline-none"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            />
            <button onClick={submit}
              className="rounded-xl px-5 font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
              Guess
            </button>
          </div>
        </div>
      )}

      {hasGuessed && !bothGuessed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-2 rounded-2xl py-4" style={{ background: 'var(--surface-muted)' }}>
          <div className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>You guessed {myGuess} — waiting for opponent...</p>
        </motion.div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface NumberRound { p1: number | null; p2: number | null }
interface NumberState {
  type: 'NUMBER_GUESS'
  target: number
  round: number
  maxRounds: number
  history: NumberRound[]
  currentGuesses: { p1: number | null; p2: number | null }
}

interface NumberGuessGameProps {
  state: NumberState
  myRole: 'p1' | 'p2'
  onGuess: (guess: number) => void
}

function hint(guess: number, target: number): { label: string; color: string } {
  if (guess === target) return { label: 'Correct!', color: '#22c55e' }
  const diff = Math.abs(guess - target)
  const direction = guess < target ? 'Too low' : 'Too high'
  const heat = diff <= 5 ? '🔥 ' : diff <= 15 ? '♨ ' : ''
  return { label: `${heat}${direction}`, color: diff <= 5 ? '#f97316' : diff <= 15 ? '#eab308' : 'var(--muted)' }
}

export function NumberGuessGame({ state, myRole, onGuess }: NumberGuessGameProps) {
  const [input, setInput] = useState('')
  const oppRole: 'p1' | 'p2' = myRole === 'p1' ? 'p2' : 'p1'
  const cg = state.currentGuesses ?? { p1: null, p2: null }
  const myCurrentGuess = cg[myRole]
  const oppCurrentGuess = cg[oppRole]
  const safeHistory = state.history ?? []
  const hasGuessedThisRound = myCurrentGuess !== null
  const bothGuessedThisRound = myCurrentGuess !== null && oppCurrentGuess !== null

  const submit = () => {
    const n = parseInt(input)
    if (isNaN(n) || n < 1 || n > 100) return
    onGuess(n)
    setInput('')
  }

  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-center" style={{ background: 'var(--accent)', color: 'white' }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
        <p className="text-xs opacity-75">Round</p>
        <p className="display text-4xl font-bold tabular-nums">{state.round} <span className="text-lg opacity-60">/ {state.maxRounds}</span></p>
        <p className="mt-1 text-xs opacity-60">Guess the secret number 1–100 · first exact guess wins</p>
      </div>

      {/* Current round status */}
      {bothGuessedThisRound && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-2">
          {(['p1', 'p2'] as const).map(role => {
            const g = cg[role]!
            const h = hint(g, state.target)
            const isMe = role === myRole
            return (
              <div key={role} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.88)', border: `1.5px solid ${isMe ? 'var(--accent)' : 'rgba(0,0,0,0.08)'}` }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>{isMe ? 'You' : 'Opponent'}</p>
                <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--ink)' }}>{g}</p>
                <p className="text-xs font-semibold mt-1" style={{ color: h.color }}>{h.label}</p>
              </div>
            )
          })}
        </motion.div>
      )}

      {/* Guess input */}
      {!hasGuessedThisRound && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Your guess for round {state.round}</p>
          <div className="flex gap-3">
            <input
              type="number" min={1} max={100}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="1 – 100"
              autoFocus
              className="mono flex-1 rounded-xl p-3 text-2xl font-bold outline-none"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            />
            <button onClick={submit}
              className="rounded-xl px-5 font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
              Guess
            </button>
          </div>
        </div>
      )}

      {hasGuessedThisRound && !bothGuessedThisRound && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-2 rounded-2xl py-4" style={{ background: 'var(--surface-muted)' }}>
          <div className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>You guessed {myCurrentGuess} — waiting for opponent...</p>
        </motion.div>
      )}

      {/* History */}
      {safeHistory.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
          <p className="text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Previous Rounds</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <AnimatePresence>
              {[...safeHistory].reverse().map((r, i) => {
                const roundNum = safeHistory.length - i
                const myG = r[myRole]
                const oppG = r[oppRole]
                const myH = myG !== null ? hint(myG, state.target) : null
                return (
                  <motion.div key={roundNum} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg"
                    style={{ background: 'var(--surface-muted)' }}>
                    <span style={{ color: 'var(--muted)' }}>R{roundNum}</span>
                    <span className="font-bold" style={{ color: 'var(--ink)' }}>You: {myG ?? '—'}</span>
                    {myH && <span className="font-semibold" style={{ color: myH.color }}>{myH.label}</span>}
                    <span style={{ color: 'var(--muted)' }}>Opp: {oppG ?? '—'}</span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

import { motion, AnimatePresence } from 'framer-motion'
import type { TriviaState } from '../../hooks/useGameServer'

interface TriviaGameProps {
  state: TriviaState
  myAddress: string
  opponentAddress: string
  onAnswer: (index: number) => void
}

const OPTIONS = ['A', 'B', 'C', 'D']

export function TriviaGame({ state, myAddress, opponentAddress, onAnswer }: TriviaGameProps) {
  const q = state.questions[state.currentQuestion]
  const myAnswer = state.answered[myAddress]
  const oppAnswer = state.answered[opponentAddress]
  const hasAnswered = myAnswer !== null
  const bothAnswered = myAnswer !== null && oppAnswer !== null

  return (
    <div className="space-y-4">
      {/* Scores */}
      <div className="flex gap-3">
        <ScoreCard label="You" score={state.scores[myAddress] ?? 0} isMe />
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            Q {state.currentQuestion + 1} / {state.questions.length}
          </div>
        </div>
        <ScoreCard label="Opponent" score={state.scores[opponentAddress] ?? 0} />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.currentQuestion}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="rounded-2xl p-5"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }}
          />
          <p className="display text-base font-semibold leading-snug">{q.question}</p>
          <div className="mt-2 flex items-center gap-2">
            {oppAnswer !== null && (
              <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(255,255,255,0.2)' }}>
                Opponent answered
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Options */}
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isMyAnswer = myAnswer === i
          const isCorrect = i === q.correct
          let bg = 'rgba(255,255,255,0.72)'
          let border = '1.5px solid rgba(255,255,255,0.8)'
          let textColor = 'var(--ink)'

          if (bothAnswered) {
            if (isCorrect) { bg = 'var(--success)'; border = '2px solid var(--success)'; textColor = 'white' }
            else if (isMyAnswer) { bg = 'var(--danger)'; border = '2px solid var(--danger)'; textColor = 'white' }
          } else if (isMyAnswer) {
            bg = 'var(--accent)'; border = '2px solid var(--accent)'; textColor = 'white'
          }

          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              disabled={hasAnswered}
              onClick={() => onAnswer(i)}
              className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-all disabled:cursor-default"
              style={{ background: bg, border, backdropFilter: 'blur(12px)' }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: isMyAnswer || (bothAnswered && isCorrect) ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)', color: textColor }}
              >
                {OPTIONS[i]}
              </span>
              <span className="text-sm font-medium" style={{ color: textColor }}>{opt}</span>
            </motion.button>
          )
        })}
      </div>

      {hasAnswered && !bothAnswered && (
        <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Waiting for opponent...</p>
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

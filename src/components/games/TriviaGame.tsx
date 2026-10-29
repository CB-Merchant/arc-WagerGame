import { motion, AnimatePresence } from 'framer-motion'

interface TriviaState {
  type: 'TRIVIA'
  questionIndex: number
  scores: { p1: number; p2: number }
  answered: { p1: boolean; p2: boolean }
}

interface TriviaGameProps {
  state: TriviaState
  myRole: 'p1' | 'p2'
  onAnswer: (index: number) => void
  questions: { q: string; options: string[]; answer: number }[]
}

const OPTIONS = ['A', 'B', 'C', 'D']

export function TriviaGame({ state, myRole, onAnswer, questions }: TriviaGameProps) {
  const oppRole = myRole === 'p1' ? 'p2' : 'p1'
  const q = questions[state.questionIndex]
  const hasAnswered = state.answered[myRole]
  const oppAnswered = state.answered[oppRole]

  if (!q) return (
    <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
      <p className="font-semibold">All questions answered!</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <ScoreCard label="You" score={state.scores[myRole]} isMe />
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            Q {state.questionIndex + 1} / {questions.length}
          </div>
        </div>
        <ScoreCard label="Opponent" score={state.scores[oppRole]} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={state.questionIndex}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
          className="relative rounded-2xl p-5" style={{ background: 'var(--accent)', color: 'white' }}>
          <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
          <p className="display text-base font-semibold leading-snug">{q.q}</p>
          {oppAnswered && (
            <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(255,255,255,0.2)' }}>
              Opponent answered
            </span>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <motion.button key={i} whileTap={{ scale: 0.98 }}
            disabled={hasAnswered}
            onClick={() => onAnswer(i)}
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all disabled:cursor-default"
            style={{
              background: hasAnswered ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(255,255,255,0.8)',
              color: 'var(--ink)',
              opacity: hasAnswered ? 0.6 : 1,
            }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {OPTIONS[i]}
            </span>
            <span className="text-sm font-medium">{opt}</span>
          </motion.button>
        ))}
      </div>
      {hasAnswered && !oppAnswered && (
        <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Waiting for opponent...</p>
      )}
    </div>
  )
}

function ScoreCard({ label, score, isMe }: { label: string; score: number; isMe?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl p-3"
      style={{ background: isMe ? 'var(--accent)' : 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: isMe ? 'white' : 'var(--ink)' }}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="display text-2xl font-bold">{score}</p>
    </div>
  )
}

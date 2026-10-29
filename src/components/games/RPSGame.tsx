import { motion } from 'framer-motion'

interface RPSState {
  type: 'RPS'
  round: number
  maxRounds: number
  scores: { p1: number; p2: number }
  moves: { p1: string | null; p2: string | null }
}

interface RPSGameProps {
  state: RPSState
  myRole: 'p1' | 'p2'
  onChoice: (choice: 'rock' | 'paper' | 'scissors') => void
}

const CHOICES: { id: 'rock' | 'paper' | 'scissors'; icon: string; beats: string }[] = [
  { id: 'rock', icon: '✊', beats: 'scissors' },
  { id: 'paper', icon: '✋', beats: 'rock' },
  { id: 'scissors', icon: '✌️', beats: 'paper' },
]

export function RPSGame({ state, myRole, onChoice }: RPSGameProps) {
  const oppRole = myRole === 'p1' ? 'p2' : 'p1'
  const myMove = state.moves[myRole]
  const oppMove = state.moves[oppRole]
  const hasChosen = myMove !== null

  // Determine round result when both moved
  let roundResult: string | null = null
  if (myMove && oppMove) {
    const wins: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
    if (myMove === oppMove) roundResult = 'Draw!'
    else if (wins[myMove] === oppMove) roundResult = 'You won this round!'
    else roundResult = 'Opponent won this round'
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <ScoreCard label="You" score={state.scores[myRole]} isMe />
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Round</p>
          <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            {state.round}<span className="text-base font-normal">/{state.maxRounds}</span>
          </p>
        </div>
        <ScoreCard label="Opponent" score={state.scores[oppRole]} />
      </div>

      {roundResult && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
          <p className="text-sm font-semibold">{roundResult}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>You: {myMove} · Opponent: {oppMove}</p>
        </motion.div>
      )}

      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          {hasChosen ? (oppMove ? 'Both chose!' : 'Waiting for opponent...') : 'Make your choice'}
        </p>
        <div className="flex gap-3">
          {CHOICES.map((c) => (
            <motion.button key={c.id} whileTap={{ scale: 0.94 }}
              disabled={hasChosen}
              onClick={() => onChoice(c.id)}
              className="flex flex-1 flex-col items-center gap-2 rounded-2xl py-5 transition-all disabled:cursor-default"
              style={{
                background: myMove === c.id ? 'var(--accent)' : 'var(--surface-muted)',
                color: myMove === c.id ? 'white' : 'var(--ink)',
                border: myMove === c.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              <span className="text-3xl">{c.icon}</span>
              <span className="text-xs font-semibold capitalize">{c.id}</span>
            </motion.button>
          ))}
        </div>
      </div>
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

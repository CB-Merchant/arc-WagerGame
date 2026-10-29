import { motion } from 'framer-motion'

interface TicTacToeState {
  type: 'TICTACTOE'
  board: (string | null)[]
  currentTurn: 'p1' | 'p2'
  winner: string | null
}

interface TicTacToeGameProps {
  state: TicTacToeState
  myRole: 'p1' | 'p2'
  onMove: (index: number) => void
}

export function TicTacToeGame({ state, myRole, onMove }: TicTacToeGameProps) {
  const isMyTurn = state.currentTurn === myRole
  const mySymbol = myRole === 'p1' ? 'X' : 'O'
  const oppSymbol = myRole === 'p1' ? 'O' : 'X'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center"
        style={{ background: isMyTurn ? 'var(--accent)' : 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: isMyTurn ? 'white' : 'var(--ink)' }}>
        <p className="display font-bold">{isMyTurn ? 'Your Turn' : "Opponent's Turn"}</p>
        <p className="text-sm opacity-75">You are {mySymbol}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {state.board.map((cell, i) => {
          const isMe = cell === myRole
          const symbol = isMe ? mySymbol : cell !== null ? oppSymbol : null
          const isEmpty = cell === null
          return (
            <motion.button key={i}
              whileTap={isEmpty && isMyTurn ? { scale: 0.94 } : {}}
              disabled={!isEmpty || !isMyTurn}
              onClick={() => onMove(i)}
              className="flex aspect-square items-center justify-center rounded-2xl text-3xl font-black transition-all"
              style={{
                background: isMe ? 'var(--accent)' : cell !== null ? 'var(--surface-muted)' : 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(16px)',
                border: `2px solid ${isEmpty && isMyTurn ? 'var(--accent)' : 'rgba(255,255,255,0.6)'}`,
                color: isMe ? 'white' : 'var(--ink)',
                opacity: isEmpty && !isMyTurn ? 0.5 : 1,
              }}>
              {symbol}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

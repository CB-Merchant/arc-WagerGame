import { motion } from 'framer-motion'
import type { TicTacToeState } from '../../hooks/useGameServer'

interface TicTacToeGameProps {
  state: TicTacToeState
  myAddress: string
  opponentAddress: string
  onMove: (index: number) => void
}

export function TicTacToeGame({ state, myAddress, opponentAddress, onMove }: TicTacToeGameProps) {
  const isMyTurn = state.currentTurn === myAddress
  const mySymbol = myAddress < opponentAddress ? 'X' : 'O'
  const oppSymbol = mySymbol === 'X' ? 'O' : 'X'

  return (
    <div className="space-y-4">
      {/* Turn indicator */}
      <div
        className="rounded-2xl p-4 text-center"
        style={{ background: isMyTurn ? 'var(--accent)' : 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: isMyTurn ? 'white' : 'var(--ink)' }}
      >
        <p className="display font-bold">{isMyTurn ? 'Your Turn' : "Opponent's Turn"}</p>
        <p className="text-sm opacity-75">You are {mySymbol}</p>
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-3">
        {state.board.map((cell, i) => {
          const isMe = cell === myAddress
          const isOpp = cell === opponentAddress
          const symbol = isMe ? mySymbol : isOpp ? oppSymbol : null
          const isEmpty = cell === null

          return (
            <motion.button
              key={i}
              whileTap={isEmpty && isMyTurn ? { scale: 0.94 } : {}}
              disabled={!isEmpty || !isMyTurn}
              onClick={() => onMove(i)}
              className="flex aspect-square items-center justify-center rounded-2xl text-4xl font-bold transition-all"
              style={{
                background: isMe
                  ? 'var(--accent)'
                  : isOpp
                  ? 'rgba(255,255,255,0.72)'
                  : isEmpty && isMyTurn
                  ? 'rgba(255,255,255,0.72)'
                  : 'rgba(255,255,255,0.4)',
                backdropFilter: 'blur(12px)',
                border: isMe ? '2px solid var(--accent)' : '1.5px solid rgba(255,255,255,0.8)',
                color: isMe ? 'white' : isOpp ? 'var(--ink-2)' : 'var(--subtle)',
                cursor: isEmpty && isMyTurn ? 'pointer' : 'default',
              }}
            >
              {symbol ?? (isEmpty && isMyTurn ? '·' : '')}
            </motion.button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 text-sm" style={{ color: 'var(--muted)' }}>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ background: 'var(--accent)' }} />
          <span>You ({mySymbol})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.1)' }} />
          <span>Opponent ({oppSymbol})</span>
        </div>
      </div>
    </div>
  )
}

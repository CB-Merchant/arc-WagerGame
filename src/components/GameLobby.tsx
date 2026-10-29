import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Lock, Shuffle, Trophy } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { GameType } from '../hooks/useGameServer'

interface GameLobbyProps {
  onPublicMatch: (gameType: GameType, wagerAmount: string) => void
  onPrivateCreate: (gameType: GameType, wagerAmount: string) => void
  onPrivateJoin: (roomCode: string) => void
}

const GAMES: { type: GameType; label: string; description: string; icon: string }[] = [
  { type: 'TRIVIA', label: 'Trivia', description: '5 blockchain questions, fastest & most correct wins', icon: '?' },
  { type: 'RPS', label: 'Rock Paper Scissors', description: 'Best of 5 rounds, pick your throw', icon: '✊' },
  { type: 'NUMBER_GUESS', label: 'Number Duel', description: 'Guess 1–100 closest to the target wins', icon: '#' },
  { type: 'TICTACTOE', label: 'Tic-Tac-Toe', description: 'Classic 3-in-a-row strategy game', icon: '×' },
]

export function GameLobby({ onPublicMatch, onPrivateCreate, onPrivateJoin }: GameLobbyProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [wager, setWager] = useState('')
  const [mode, setMode] = useState<'pick' | 'public' | 'private_create' | 'private_join'>('pick')
  const [roomCode, setRoomCode] = useState('')

  const canProceed = selectedGame && wager && parseFloat(wager) > 0

  if (mode === 'pick') {
    return (
      <div className="space-y-4">
        <h2 className="display text-xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
          Choose your game
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {GAMES.map((g) => (
            <motion.button
              key={g.type}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedGame(g.type === selectedGame ? null : g.type)}
              className="relative overflow-hidden rounded-2xl p-4 text-left transition-all"
              style={
                selectedGame === g.type
                  ? {
                      background: 'var(--accent)',
                      color: 'white',
                      border: '2px solid var(--accent)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.72)',
                      backdropFilter: 'blur(16px)',
                      border: '1.5px solid rgba(255,255,255,0.8)',
                      color: 'var(--ink)',
                    }
              }
            >
              {selectedGame === g.type && (
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }}
                />
              )}
              <div
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold"
                style={{
                  background: selectedGame === g.type ? 'rgba(255,255,255,0.2)' : 'var(--surface-muted)',
                  color: selectedGame === g.type ? 'white' : 'var(--ink)',
                }}
              >
                {g.icon}
              </div>
              <p className="display text-sm font-semibold leading-tight">{g.label}</p>
              <p
                className="mt-1 text-xs leading-snug"
                style={{ color: selectedGame === g.type ? 'rgba(255,255,255,0.75)' : 'var(--muted)' }}
              >
                {g.description}
              </p>
            </motion.button>
          ))}
        </div>

        {/* Wager input */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Wager Amount
          </label>
          <div className="flex items-center gap-3">
            <TokenUSDC variant="branded" size={24} />
            <input
              type="number"
              placeholder="0.00"
              value={wager}
              onChange={(e) => setWager(e.target.value)}
              className="display flex-1 bg-transparent text-2xl font-bold outline-none"
              style={{ color: 'var(--ink)' }}
              min="0.01"
              step="0.01"
            />
            <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <div className="mt-3 flex gap-2">
            {['1', '5', '10', '25'].map((amt) => (
              <button
                key={amt}
                onClick={() => setWager(amt)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: wager === amt ? 'var(--accent)' : 'var(--surface-muted)',
                  color: wager === amt ? 'white' : 'var(--ink)',
                }}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Mode buttons */}
        <div className="space-y-2">
          <button
            disabled={!canProceed}
            onClick={() => setMode('public')}
            className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-opacity disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <Shuffle size={20} />
            <div>
              <p className="font-semibold">Find Random Opponent</p>
              <p className="text-xs opacity-75">Match with anyone playing the same game & wager</p>
            </div>
          </button>
          <button
            disabled={!canProceed}
            onClick={() => setMode('private_create')}
            className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-opacity disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: 'var(--ink)' }}
          >
            <Lock size={20} />
            <div>
              <p className="font-semibold">Create Private Room</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Get a code to share with a friend</p>
            </div>
          </button>
          <button
            onClick={() => setMode('private_join')}
            className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)', color: 'var(--ink)' }}
          >
            <Users size={20} />
            <div>
              <p className="font-semibold">Join with Room Code</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Enter a code from a friend</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'public') {
    return (
      <ConfirmScreen
        title="Find Random Opponent"
        icon={<Shuffle size={28} />}
        game={GAMES.find(g => g.type === selectedGame)!}
        wager={wager}
        actionLabel="Start Matchmaking"
        onConfirm={() => onPublicMatch(selectedGame!, wager)}
        onBack={() => setMode('pick')}
      />
    )
  }

  if (mode === 'private_create') {
    return (
      <ConfirmScreen
        title="Create Private Room"
        icon={<Lock size={28} />}
        game={GAMES.find(g => g.type === selectedGame)!}
        wager={wager}
        actionLabel="Create & Get Code"
        onConfirm={() => onPrivateCreate(selectedGame!, wager)}
        onBack={() => setMode('pick')}
      />
    )
  }

  // private_join
  return (
    <div className="space-y-4">
      <button onClick={() => setMode('pick')} className="text-sm font-medium" style={{ color: 'var(--muted)' }}>← Back</button>
      <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Join with Code</h2>
      <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <label className="mb-3 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>4-Digit Room Code</label>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="0000"
          inputMode="numeric"
          maxLength={4}
          className="mono w-full rounded-xl bg-transparent py-3 text-center text-5xl font-black tracking-[0.3em] outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        />
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Enter the 4-digit code from your friend</p>
      </div>
      <button
        disabled={roomCode.length !== 4}
        onClick={() => onPrivateJoin(roomCode.trim())}
        className="w-full rounded-2xl py-4 font-semibold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        Join Room
      </button>
    </div>
  )
}

function ConfirmScreen({
  title, icon, game, wager, actionLabel, onConfirm, onBack
}: {
  title: string
  icon: React.ReactNode
  game: { label: string; description: string }
  wager: string
  actionLabel: string
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-medium" style={{ color: 'var(--muted)' }}>← Back</button>
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}>
        <div className="mb-4 flex items-center gap-3" style={{ color: 'var(--ink)' }}>
          {icon}
          <h2 className="display text-lg font-bold">{title}</h2>
        </div>
        <div className="space-y-3">
          <Row label="Game" value={game.label} />
          <Row label="Wager" value={`${wager} USDC`} highlight />
          <Row label="Total Pot" value={`${(parseFloat(wager) * 2).toFixed(2)} USDC`} />
          <Row label="Platform Fee" value="2%" />
          <Row label="Winner Gets" value={`${(parseFloat(wager) * 2 * 0.98).toFixed(2)} USDC`} highlight />
        </div>
      </div>
      <button
        onClick={onConfirm}
        className="w-full rounded-2xl py-4 font-semibold transition-opacity"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <div className="flex items-center justify-center gap-2">
          <Trophy size={18} />
          {actionLabel}
        </div>
      </button>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-base' : ''}`} style={{ color: highlight ? 'var(--success)' : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}

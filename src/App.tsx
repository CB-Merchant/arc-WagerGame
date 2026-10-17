import { useState, useCallback } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { keccak256, encodePacked } from 'viem'
import { GameLobby } from './components/GameLobby'
import { MatchmakingScreen } from './components/MatchmakingScreen'
import { GameRoom } from './components/GameRoom'
import { UsdcBalance } from './components/UsdcBalance'
import type { GameType } from './hooks/useGameServer'

const ARC_TESTNET_CHAIN_ID = 5042002

// Encode gameType to bytes32 salt using random bytes for room uniqueness
function generateRoomId(address: string, _gameType: GameType): string {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32))
  const saltHex = `0x${Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` satisfies string as `0x${string}`
  const roomId = keccak256(encodePacked(['bytes32', 'address', 'uint256'], [saltHex, address as `0x${string}`, BigInt(Date.now())]))
  return roomId
}

type AppView =
  | { type: 'lobby' }
  | { type: 'matchmaking'; gameType: GameType; wagerAmount: string; salt: string }
  | { type: 'room'; roomId: string; gameType: GameType; wagerAmount: string; isPlayer1: boolean; opponentAddress: string; isPrivate: boolean }

export default function App() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [view, setView] = useState<AppView>({ type: 'lobby' })

  const handlePublicMatch = useCallback((gameType: GameType, wagerAmount: string) => {
    if (!address) { toast.error('Connect your wallet first'); return }
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
      toast.info('Switching to Arc Testnet...')
      return
    }
    const salt = generateRoomId(address, gameType)
    setView({ type: 'matchmaking', gameType, wagerAmount, salt })
  }, [address, chainId, switchChain])

  const handlePrivateCreate = useCallback((gameType: GameType, wagerAmount: string) => {
    if (!address) { toast.error('Connect your wallet first'); return }
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
      toast.info('Switching to Arc Testnet...')
      return
    }
    const roomId = generateRoomId(address, gameType)
    setView({
      type: 'room',
      roomId,
      gameType,
      wagerAmount,
      isPlayer1: true,
      opponentAddress: '',
      isPrivate: true,
    })
  }, [address, chainId, switchChain])

  const handlePrivateJoin = useCallback((roomCode: string) => {
    if (!address) { toast.error('Connect your wallet first'); return }
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
      toast.info('Switching to Arc Testnet...')
      return
    }
    // Fetch room info from server to get wager and game type
    fetch(`/api/room/${roomCode}`)
      .then(r => r.json())
      .then((d: { room?: { gameType: GameType; wagerAmount: string; player1: string } }) => {
        if (!d.room) { toast.error('Room not found'); return }
        setView({
          type: 'room',
          roomId: roomCode,
          gameType: d.room.gameType,
          wagerAmount: d.room.wagerAmount,
          isPlayer1: false,
          opponentAddress: d.room.player1,
          isPrivate: true,
        })
      })
      .catch(() => toast.error('Could not find that room'))
  }, [address, chainId, switchChain])

  const handleMatchFound = useCallback((roomId: string, player1: string, player2: string) => {
    if (!address) return
    const isMe1 = player1.toLowerCase() === address.toLowerCase()
    const v = view
    if (v.type !== 'matchmaking') return
    setView({
      type: 'room',
      roomId,
      gameType: v.gameType,
      wagerAmount: v.wagerAmount,
      isPlayer1: isMe1,
      opponentAddress: isMe1 ? player2 : player1,
      isPrivate: false,
    })
  }, [address, view])

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', top: '6%', left: '4%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.18) 0%, transparent 70%)', filter: 'blur(64px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '6%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.16) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', top: '45%', right: '15%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(175,143,244,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-10 pt-6">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="display text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>WagerGame</h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Play. Wager. Win USDC.</p>
          </div>
          <ConnectKitButton />
        </header>

        {/* Wallet balance strip */}
        {isConnected && address && chainId === ARC_TESTNET_CHAIN_ID && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <UsdcBalance address={address} chainId={chainId} />
          </motion.div>
        )}

        {/* Chain warning */}
        {isConnected && chainId !== ARC_TESTNET_CHAIN_ID && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ background: '#fef3c7', border: '1.5px solid #f59e0b' }}
          >
            <p className="text-sm font-medium text-amber-800">Switch to Arc Testnet to play</p>
            <button
              onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: '#f59e0b', color: 'white' }}
            >
              Switch
            </button>
          </motion.div>
        )}

        {/* Not connected */}
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl p-5 text-center"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.8)' }}
          >
            <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Connect your wallet to play</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Wager Arc Testnet USDC against other players</p>
          </motion.div>
        )}

        {/* Main content */}
        <AnimatePresence mode="wait">
          {view.type === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <GameLobby
                onPublicMatch={handlePublicMatch}
                onPrivateCreate={handlePrivateCreate}
                onPrivateJoin={handlePrivateJoin}
              />
            </motion.div>
          )}

          {view.type === 'matchmaking' && (
            <motion.div key="matchmaking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <MatchmakingScreen
                address={address ?? ''}
                gameType={view.gameType}
                wagerAmount={view.wagerAmount}
                salt={view.salt}
                onMatchFound={handleMatchFound}
                onCancel={() => setView({ type: 'lobby' })}
              />
            </motion.div>
          )}

          {view.type === 'room' && (
            <motion.div key="room" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <GameRoom
                address={address ?? ''}
                chainId={chainId ?? 0}
                roomId={view.roomId}
                gameType={view.gameType}
                wagerAmount={view.wagerAmount}
                isPlayer1={view.isPlayer1}
                opponentAddress={view.opponentAddress}
                isPrivate={view.isPrivate}
                onLeave={() => setView({ type: 'lobby' })}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

# WagerGame — Claude Handoff Document

This document gives you everything you need to continue fixing and improving the WagerGame project. Read it fully before touching any code.

---

## What This Project Is

A multiplayer USDC wager game platform deployed at **https://www.arcwagergame.fun**

- Players connect a wallet, pick a game (Trivia, RPS, Number Duel, Tic-Tac-Toe), set a USDC wager amount, and either find a random opponent or create/join a private room with a 4-digit code
- Both players lock their USDC wager into a smart contract on-chain. The winner receives the combined pot minus a 2% fee
- Real-time game state sync happens via Ably channels
- Deployed on Vercel (frontend + API routes). No separate backend server in production

---

## How to Push Every Fix to GitHub and Vercel Automatically

**Every time you change code:**

```bash
# 1. Run lint + typecheck (must pass before pushing)
cd /home/user/app && bash scripts/check.sh

# 2. Commit and push to GitHub (Vercel auto-deploys on push to main)
export PATH="$HOME/.local/bin:$PATH"
TOKEN=$(gh auth token)
cd /home/user/app
git remote set-url origin "https://x-access-token:${TOKEN}@github.com/CB-Merchant/arc-WagerGame.git"
git add -A
git commit -m "fix: <describe what you fixed>"
git push origin main
git remote set-url origin https://github.com/CB-Merchant/arc-WagerGame.git
```

Vercel auto-deploys from the `main` branch. After pushing, wait ~2 minutes for the deploy to go live at https://www.arcwagergame.fun

**Never push if `bash scripts/check.sh` reports errors.** Fix errors first.

---

## Repository

- GitHub: https://github.com/CB-Merchant/arc-WagerGame
- Vercel project: `arc-wagergame`
- Live URL: https://www.arcwagergame.fun
- Custom domain via Hostinger DNS → Vercel

---

## Smart Contract

- **WagerGame.sol** deployed on Arc Testnet at `0xcdd8440b4de140078ce5bdcd0569b73a93627519`
- Chain: Arc Testnet, Chain ID `5042002`, RPC `https://rpc.testnet.arc.io`
- USDC address on Arc Testnet: `0x3600000000000000000000000000000000000000` (6 decimals)
- Constructor args: `usdcToken=0x3600...`, `resolver=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`, `feeRecipient=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`, `feeBps=200`
- ABI is embedded in `src/abi/WagerGame.ts` — do NOT change this file unless the contract is redeployed

---

## Environment Variables

These are set in Vercel. **Never hardcode values.**

| Variable | Purpose | Where set |
|---|---|---|
| `VITE_WAGER_CONTRACT` | Contract address (baked into frontend build) | Vercel |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | Vercel |
| `ABLY_API_KEY` | Ably root key (server-side API routes only) | Vercel |

For local dev, copy these into `/home/user/app/.env`.

---

## Architecture

### Frontend (React + Vite + wagmi)

```
src/
  App.tsx                    — routing, wallet connection, view state
  config.ts                  — wagmi config (Arc Testnet only, WalletConnect)
  components/
    GameLobby.tsx            — game + wager selection, create/join buttons
    GameRoom.tsx             — THE MOST IMPORTANT FILE — on-chain tx flow + game rendering
    MatchmakingScreen.tsx    — public matchmaking UI (polls /api/matchmake)
    UsdcBalance.tsx          — reads USDC balance from Arc Testnet RPC
    Logo.tsx                 — SVG hex logo
    games/
      TicTacToeGame.tsx      — uses p1/p2 role keys
      RPSGame.tsx            — uses p1/p2 role keys
      TriviaGame.tsx         — uses p1/p2 role keys
      NumberGuessGame.tsx    — uses p1/p2 role keys
  hooks/
    useAblyGame.ts           — Ably singleton (getAbly), useOnlinePlayersAbly, useAblyMatchmaking
    useGameServer.ts         — OLD WebSocket hook (DO NOT USE for game logic — dead in production)
  abi/
    WagerGame.ts             — contract ABI (do not edit)
  onchain-facts.ts           — chain/USDC facts (do not edit)
  onchain-money.ts           — USDC decimal helpers (do not edit)
```

### API Routes (Vercel Serverless — Node.js runtime)

```
api/
  auth.ts          — Ably token auth endpoint (called by Ably SDK to get a token)
  create-room.ts   — stores room in Ably history, returns { roomId, pin, room }
  room.ts          — fetches room by roomId or 4-digit PIN from Ably history
  join-room.ts     — publishes player_joined event to Ably channel
  matchmake.ts     — queue-based matchmaking using Ably channel history
  game-action.ts   — processes game moves (currently unused by frontend — game logic runs client-side)
  resolve.ts       — called after game ends to record winner (logs only on testnet)
  rooms.ts         — returns [] (stateless placeholder)
```

### Real-time (Ably)

- Ably channels are used for game sync between players
- Auth: clients call `/api/auth?clientId=<walletAddress>` to get a token
- Channels used:
  - `room:<roomId>` — game events: `game_start`, `game_state`, `game_over`, `opponent_ready`
  - `queue:<gameType>:<wagerAmount>` — matchmaking queue
  - `match-result:<playerId>` — stores match result for poll pickup
  - `player:<playerId>` — direct push notification to a player
  - `room-lookup` — stores room by roomId for `/api/room` lookup
  - `pin-lookup` — stores room by PIN for 4-digit join
  - `lobby` — presence for online player count

---

## The Game Flow (Critical — Read This)

### Private Room (Create)

1. Player 1 selects game + wager → clicks "Create Private Room"
2. `App.tsx: handlePrivateCreate` → generates a `keccak256` roomId → navigates to `GameRoom` with `isPlayer1=true`
3. `GameRoom` mounts → connects to Ably channel `room:<roomId>` using `getAbly(address)`
4. Player 1 sees Step 1: **Approve USDC** button → clicks → MetaMask prompts (auto-switches to Arc Testnet if needed because `chainId: ARC_TESTNET_CHAIN_ID` is passed to wagmi)
5. Approve tx confirms → `txPhase` → `'approved'`
6. Player 1 sees Step 2: **Create Room** button + preview of 4-digit PIN → clicks → MetaMask prompts
7. Create tx confirms → POST `/api/create-room` → `txPhase` → `'waiting_opponent'`
8. Player 1 sees the **4-digit PIN** large on screen + "Waiting for opponent..."

### Private Room (Join)

1. Player 2 enters 4-digit PIN → clicks "Join Room"
2. `App.tsx: handlePrivateJoin` → GET `/api/room?id=<pin>` → server resolves PIN to full roomId → navigates to `GameRoom` with `isPlayer1=false`
3. `GameRoom` mounts → connects to same Ably channel
4. Player 2 sees Step 1: **Approve USDC** → clicks → MetaMask prompts
5. Approve confirms → `txPhase` → `'approved'`
6. Player 2 sees Step 2: **Join & Start Game** → clicks → MetaMask prompts
7. Join tx confirms → POST `/api/join-room` → publishes `opponent_ready` to Ably channel (with retry until channel is ready)
8. Player 1 receives `opponent_ready` → creates canonical game state → sets `txPhase = 'game_active'` → publishes `game_start` with that state to Ably
9. Player 2 receives `game_start` → sets `txPhase = 'game_active'` with Player 1's state (same state = same NUMBER_GUESS target)
10. Both players now see the game board

### Public Matchmaking

1. Player clicks "Find Random Opponent" → `App.tsx: handlePublicMatch` → navigates to `MatchmakingScreen`
2. `MatchmakingScreen` calls `useAblyMatchmaking(address).startMatchmaking(gameType, wagerAmount)`
3. Client polls `/api/matchmake` every 2 seconds
4. Server checks `queue:<gameType>:<wagerAmount>` Ably channel history for a waiting player
5. If found: server stores match result on `match-result:<player1>` and `match-result:<player2>`, returns `{ status: 'matched', roomId, role }`
6. Both clients receive `matched` → navigate to `GameRoom`
7. Player with `role='player1'` acts as Player 1 (creates room on-chain), `role='player2'` joins

### Game Logic (Client-Side)

- Game state lives entirely in `GameRoom.tsx` — no server needed for moves
- Each player sends moves to Ably, which broadcasts to the opponent
- `handleGameAction` updates local state and publishes `game_state` to `room:<roomId>`
- When the game ends, the winner's client calls POST `/api/resolve` (currently just logs on testnet)
- Game state keys use `p1` and `p2` — NOT wallet addresses

---

## Known Issues (Fix These)

### 1. Blank screen on PC after entering GameRoom

**Symptom:** Prize pool shows but no buttons appear below it.

**Root cause history:** Multiple issues have been patched. The last known cause was `AnimatePresence mode="wait"` from framer-motion holding an animation lock, preventing child renders. This was removed in the latest commit. If blank screen still occurs, check:
- `isPlayer1` prop — should be `true` for the creator, `false` for the joiner
- `txPhase` — should be `'idle'` on mount; if it's something else, a stale wagmi error is resetting it
- `wagerAmount` — must be a valid decimal string like `"5"` or `"10"`, not empty or NaN
- The `approveError`/`createError`/`joinError` useEffects — they reset `txPhase` but only fire once per unique error message (deduped via `useRef`)

**If still blank:** Add `console.log('render', isPlayer1, txPhase)` at the top of `GameRoom` render and check browser console.

### 2. Game doesn't start after both players confirm on-chain

**Symptom:** Both players reach "waiting" or "preparing" state but the game board never appears.

**Root cause:** The `opponent_ready` Ably message from Player 2 must reach Player 1 while Player 1 is subscribed to the channel. The retry logic in `GameRoom.tsx` retries publishing `opponent_ready` up to 10 times at 500ms intervals.

**If broken:** Check that `getAbly(address)` is returning the same client instance for both players (they use different addresses so they get different clients — that's correct). The issue is if the channel subscription isn't set up before the retry attempts exhaust.

**Fix approach:** Increase retry attempts from 10 to 20, or increase the interval from 500ms to 1000ms in the `tryPublish` functions.

### 3. MetaMask on PC doesn't switch chains automatically

**Symptom:** MetaMask is on Ethereum mainnet. Clicking Approve doesn't prompt a chain switch.

**Current fix:** `writeContract` is called with `chainId: ARC_TESTNET_CHAIN_ID` — wagmi should auto-prompt MetaMask to switch. If it doesn't:

**Manual fix to add:** After `GameRoom` mounts, immediately call `switchChain({ chainId: ARC_TESTNET_CHAIN_ID })` in a `useEffect` if `chainId !== ARC_TESTNET_CHAIN_ID`. This proactively switches before the user clicks anything.

```typescript
// Add this near the top of GameRoom, after the wagmi hooks
const { switchChain } = useSwitchChain()
useEffect(() => {
  if (chainId && chainId !== ARC_TESTNET_CHAIN_ID) {
    switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
  }
}, [chainId, switchChain])
```

Note: `chainId` was removed from `GameRoomProps` in a recent commit. You'll need to add it back or read it from `useAccount()` inside `GameRoom`.

### 4. Matchmaking doesn't find opponent

**Symptom:** Two players on same game + wager amount both show "Searching..." but never match.

**Mechanism:** Server uses Ably channel history as a queue. When Player 2 calls `/api/matchmake`, it reads history from `queue:<gameType>:<wagerAmount>` and looks for a `queued` message from a different player that hasn't been `dequeued` and is less than 10 minutes old.

**Debug:** Call the API directly:
```bash
curl -X POST https://www.arcwagergame.fun/api/matchmake \
  -H "Content-Type: application/json" \
  -d '{"playerId":"0xAAA","gameType":"TICTACTOE","wagerAmount":"5"}'
# Then immediately:
curl -X POST https://www.arcwagergame.fun/api/matchmake \
  -H "Content-Type: application/json" \
  -d '{"playerId":"0xBBB","gameType":"TICTACTOE","wagerAmount":"5"}'
# Second call should return { status: 'matched', roomId: ..., role: 'player2' }
```

If it returns `queued` both times, Ably history isn't persisting. Check Ably dashboard for channel history settings — history must be enabled on the channel (it is by default but check if the free plan limits it).

---

## Key Constraints — Do Not Break These

1. **Game state uses `p1`/`p2` keys** — never wallet addresses. All four game components (`TicTacToeGame`, `RPSGame`, `TriviaGame`, `NumberGuessGame`) take `myRole: 'p1' | 'p2'` and use `state.scores.p1`, `state.moves.p1`, etc.

2. **Single Ably client per wallet address** — `getAbly(address)` in `useAblyGame.ts` is a singleton that resets when the address changes. Never create `new Ably.Realtime(...)` directly in components — always use `getAbly(address)`.

3. **Never import from `useGameServer.ts` for game logic** — that file is the old WebSocket implementation. It only exports the `GameType` type which is still used. Don't use `useGameServer`, `useOnlinePlayers` (WS version), or `useMatchmaking` from it.

4. **`chainId: ARC_TESTNET_CHAIN_ID` must be on every `writeContract` call** — this is what triggers the chain-switch prompt in MetaMask if the user is on the wrong network.

5. **Vercel API routes must use dynamic imports for Ably** — `const Ably = (await import('ably')).default` — NOT top-level `import Ably from 'ably'`. Top-level imports crash the Vercel Node.js runtime.

6. **`wagerAmount` is always a decimal string** like `"5"` or `"10.50"` — use `parseFloat(wagerAmount)` before math, use `parseUnits(wagerFloat.toFixed(6), 6)` for on-chain bigint.

7. **PIN is derived client-side** from the roomId: `(parseInt(roomId.slice(-6), 16) % 9000 + 1000).toString()` — the server uses the same formula. Don't change this formula.

---

## File-by-File: What Each File Does

### `src/App.tsx`
- Holds top-level `view` state: `'lobby'` | `'matchmaking'` | `'room'`
- `handlePrivateCreate` → generates roomId → goes to room with `isPlayer1: true`
- `handlePrivateJoin` → fetches room from `/api/room?id=<pin>` → goes to room with `isPlayer1: false`
- `handlePublicMatch` → goes to matchmaking screen
- `handleMatchFound` → called by `MatchmakingScreen` when matched → goes to room

### `src/components/GameRoom.tsx`
- The most complex file. Handles the full lifecycle:
  - Ably channel subscription (uses `getAbly(address)`)
  - USDC approve → create/join room on-chain → wait for opponent → game
  - All four game logic handlers (`handleGameAction`)
  - Game over + winner determination
- `txPhase` state machine: `idle → approving → approved → creating_room → waiting_opponent → game_active → game_over`
- Player 1 role: approve → create room → wait → receive `opponent_ready` → init state → send `game_start`
- Player 2 role: approve → join room → send `opponent_ready` → receive `game_start` → start game

### `src/hooks/useAblyGame.ts`
- `getAbly(clientId)` — singleton Ably Realtime client, resets on address change
- `useOnlinePlayersAbly(playerId)` — lobby presence count (skips if playerId is `'anon'` or empty)
- `useAblyMatchmaking(playerId)` — polls `/api/matchmake` every 2s, handles match result
- `useAblyRoom` — NOT used by GameRoom (GameRoom uses getAbly directly)

### `api/matchmake.ts`
- POST: checks if player already matched (Ably history on `match-result:<id>`), then checks queue, then queues if no match
- DELETE: removes player from queue (publishes `dequeued`)
- Uses Ably channel history as persistent queue storage

### `api/room.ts`
- GET `?id=<value>`: if 4 digits → checks `pin-lookup` channel history; otherwise checks `room-lookup` channel history
- Returns `{ room, roomId }` — `roomId` is the full on-chain ID even when lookup was by PIN

---

## What Is Working (As Of Latest Commit)

- Contract deployed and verified on Arc Testnet
- API endpoints: `/api/auth`, `/api/create-room`, `/api/room`, `/api/matchmake` all return correct responses
- Game components all use `p1`/`p2` role keys correctly
- Ably singleton resets properly when wallet address changes
- Balance display works on mobile (Arc USDC via ERC-20 read on Arc Testnet RPC)
- Online player count via Ably lobby presence
- 4-digit PIN derived instantly client-side
- Chain-switch is triggered by `chainId` param on `writeContract`
- `AnimatePresence` removed from GameRoom (was causing blank screen)

## What Is Not Yet Verified Working

- PC MetaMask flow end-to-end (blank screen may still occur — see Known Issues #1 and #3)
- Matchmaking with two real wallets (see Known Issues #4)
- Game playing through to completion and resolving on-chain

---

## Vercel Deployment Notes

- `vercel.json` is minimal — no runtime spec needed (Vercel auto-detects Node.js for `api/` files)
- All `api/*.ts` files are Vercel serverless functions
- Build command: `bun run build` (runs `vite build`)
- Output: `dist/`
- Node.js version: 20.x (set in Vercel dashboard)

## Local Dev

```bash
cd /home/user/app
bun install
bun run dev   # starts Vite on port 5173
```

API routes don't run locally via `bun run dev` — they only run on Vercel. To test locally, use the live Vercel URL or set up a local proxy.

---

## GitHub Repo Structure

```
arc-WagerGame/
  api/              ← Vercel serverless functions
  contracts/        ← Solidity (WagerGame.sol), Foundry tests
  public/           ← favicon.svg, static assets
  scripts/          ← check.sh (lint+typecheck), compass-deploy helpers
  src/              ← React frontend
  index.html
  vite.config.ts
  foundry.toml
  vercel.json
  package.json      ← scripts: dev, build, check
```

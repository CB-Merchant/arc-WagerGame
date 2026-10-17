# WagerGame

> Built with Arc Studio - money-powered apps in minutes

USDC PvP wager game on Arc Testnet. Players choose a game (Trivia, RPS, Number Duel, Tic-Tac-Toe), lock a USDC wager in the smart contract, play, and the winner receives the combined pot minus a 2% platform fee.

## Deployed Contracts

| Contract | Address | Chain | Explorer |
|---|---|---|---|
| WagerGame | 0xcdd8440b4de140078ce5bdcd0569b73a93627519 | Arc Testnet | https://explorer.testnet.arc.io/address/0xcdd8440b4de140078ce5bdcd0569b73a93627519 |

After deploying, set `VITE_WAGER_CONTRACT=<address>` in `.env`.

## Constructor Args (WagerGame)
1. `usdcToken` = `0x3600000000000000000000000000000000000000`
2. `resolver` = platform deployer wallet (or a trusted server wallet)
3. `feeRecipient` = platform deployer wallet
4. `feeBps` = `200`

## Backend Server
- `bun run server` → port 3001 (proxied as `/api` and `/ws` by Vite)
- Handles: matchmaking queue, game state, WebSocket connections

## Architecture
- `contracts/WagerGame.sol` — escrow, room management, USDC wager release
- `server/index.ts` — matchmaking + game logic server
- `src/components/GameLobby.tsx` — game+wager selection
- `src/components/MatchmakingScreen.tsx` — public opponent search
- `src/components/GameRoom.tsx` — on-chain wager flow + live game
- `src/components/games/` — TriviaGame, RPSGame, NumberGuessGame, TicTacToeGame

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```

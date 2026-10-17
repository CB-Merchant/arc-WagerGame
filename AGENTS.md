# WagerGame

> Built with Arc Studio - money-powered apps in minutes

USDC PvP wager game on Arc Testnet. Players choose a game (Trivia, RPS, Number Duel, Tic-Tac-Toe), lock a USDC wager in the smart contract, play, and the winner receives the combined pot minus a 2% platform fee.

## Deployed Contracts

| Contract | Address | Chain | Explorer |
|---|---|---|---|
| WagerGame | 0xcdd8440b4de140078ce5bdcd0569b73a93627519 | Arc Testnet | https://explorer.testnet.arc.io/address/0xcdd8440b4de140078ce5bdcd0569b73a93627519 |

After deploying, set `VITE_WAGER_CONTRACT=<address>` in `.env`.

## Mainnet Pre-Deploy Checklist

Before deploying to Arc Mainnet, complete every item below:

1. **Transfer contract ownership** — immediately after deploy, call `transferOwnership(<your-wallet>)` from the deployer. The current owner can change fees (up to 10%), swap the resolver, and redirect the fee recipient.

2. **Replace the resolver with a wallet you control** — the resolver decides who wins every game. Use a wallet you hold the private key for, or ideally a multi-sig (e.g. Safe). The current resolver is the Arc Studio platform deployer (`0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`) which is not suitable for mainnet.

3. **Set feeRecipient to your own address** — fees currently go to the platform deployer wallet. Pass your own address in the constructor or call `setFeeRecipient` after deploy.

4. **Add a dispute window or multi-sig resolver** — game outcomes are reported off-chain with no on-chain verification. For real-money games, consider a timelock on `resolveGame` or a multi-sig that requires 2-of-3 signatures before funds are released.

5. **Paginate `getOpenPublicRooms`** — the public room array is unbounded. Add an offset/limit view function before launching to avoid gas issues at scale.

6. **Independent security audit** — get the contract audited by a third-party firm before handling real funds. The in-session review covered common patterns but is not a substitute for a full audit.

7. **Run full tests on testnet first** — play end-to-end games on Arc Testnet with real wallets, verify the resolver flow, timeout refunds, and fee accounting before going live.

8. **Update `VITE_WAGER_CONTRACT` and redeploy Vercel** — swap in the mainnet address and redeploy the frontend after the mainnet contract is live.

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

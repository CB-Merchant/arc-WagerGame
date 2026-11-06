# WagerGame Security Review — Mainnet Pre-Deploy
Date: 2026-11-01  
Target chain: Arc Mainnet (chain ID 5042001)  
Severity level: max

---

## Summary

6 findings total: 2 Critical, 2 High/Medium (structural), 2 Medium (griefing/UX).

**Recommendation: do NOT deploy to mainnet until the two Critical findings are addressed.**

---

## Critical Findings

### 1. Resolver can award pot to wrong player with no proof
**Location:** `resolveGame` (line 145)

`resolveGame(roomId, winner)` accepts any player address as winner with no cryptographic proof that the off-chain game was played fairly. A compromised or malicious resolver key can call this function and direct real USDC to the wrong player. Since the resolver is a single EOA you control, if that key is lost or stolen all active rooms are at risk.

**Fix options (pick one):**
- Require both players to sign the game result off-chain, and verify both signatures in `resolveGame`.
- Add a 24-hour challenge window where the losing player can dispute before funds release.
- Use a multisig (2-of-3) as resolver so no single key can act unilaterally.

**Minimum acceptable for mainnet:** Use a multisig (e.g. Safe) as the resolver address.

---

### 2. Fund-lock if a player address is USDC-blocklisted
**Location:** `resolveGame` (line 159), `claimTimeout` (lines 195–196)

USDC has a blocklist. If either player or `feeRecipient` is on Circle's blocklist, `safeTransfer` reverts — the entire payout call fails and funds are permanently locked in the contract with no recovery path.

`claimTimeout` is especially risky: it transfers to BOTH players in sequence. If player1's transfer succeeds but player2's reverts, the tx rolls back and player1 loses their refund too.

**Fix:** Replace push-payment with pull-payment (credit mapping + separate `withdraw()` function). This way one blocked address cannot brick payouts for the other player.

---

## High/Medium Findings

### 3. Owner is a single deployer EOA with no timelock
**Location:** Constructor (line 73), `setResolver`, `setFeeBps`, `setFeeRecipient`

The deployer wallet becomes owner instantly. The owner can change the resolver (controls all payouts) and fee recipient with a single transaction and zero delay. A compromised owner key is catastrophic.

**Fix:** Transfer ownership to a Safe multisig immediately after deploy, or use `Ownable2Step` and accept from the multisig. Add a timelock (48h minimum) before resolver/fee changes take effect.

### 4. Single-step ownership transfer
**Location:** OpenZeppelin `Ownable.transferOwnership`

If you call `transferOwnership` with a wrong address (typo, clipboard error), ownership is gone permanently.

**Fix:** Replace `Ownable` with `Ownable2Step` — requires the new owner to explicitly accept.

---

## Medium Findings

### 5. Timeout griefing
**Location:** `claimTimeout` (line 185)

A losing player can simply go offline and force the 2-hour timeout, getting their money back instead of paying out the winner. There is no on-chain penalty for abandoning a game.

**Accepted risk for v1:** The 2-hour timeout is a safety net, not an exploit. Griefing costs the griefer their own time and gas. Acceptable for launch.

### 6. Room ID collision via block.timestamp
**Location:** `createRoom` (line 93)

`roomId = keccak256(salt, msg.sender, block.timestamp)` — two creates in the same block with the same salt by the same address produce the same roomId (caught by the `require(rooms[roomId].createdAt == 0)` check). Not exploitable in practice since salt includes randomness from the client.

**Accepted risk:** Low. The require guard prevents actual collision.

---

## Mainnet Deploy Checklist

Before deploying to Arc Mainnet, complete these in order:

- [ ] **Critical #1:** Use a Safe multisig (2-of-3 minimum) as the `resolver` address
- [ ] **Critical #2:** Implement pull-payment in `resolveGame` and `claimTimeout`
- [ ] **High #3:** Transfer ownership to a Safe multisig immediately after deploy
- [ ] **High #4:** Use `Ownable2Step` instead of `Ownable`
- [ ] Paste your resolver wallet address and fee recipient address before deploy
- [ ] Confirm Arc Mainnet USDC address: read from `@/onchain-facts` at deploy time
- [ ] Set `VITE_WAGER_CONTRACT` in Vercel to the new mainnet address
- [ ] Update `AGENTS.md` with the mainnet contract address

---

## Minimum Viable Mainnet Path (fastest safe route)

If you want to deploy quickly without a full rewrite:

1. Deploy with a **Safe multisig as both owner and resolver**
2. Accept the fund-lock risk for now (low probability, Circle rarely blocklists game wallets)
3. Monitor active rooms and resolve promptly to minimise exposure window
4. Ship the pull-payment fix in a redeployment within 30 days

Built with [Arc Studio](https://studio.arc.io)

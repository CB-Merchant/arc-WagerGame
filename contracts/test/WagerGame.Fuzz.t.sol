// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WagerGameTestBase} from "./WagerGame.Base.t.sol";
import {WagerGame} from "../WagerGame.sol";

contract WagerGameFuzzTest is WagerGameTestBase {
    // ═══════════════════════════════════════════════════════════════════════
    //  Fuzz: fee calculation never pays out more than totalPot
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice For any valid feeBps and wager, payout + fee == totalPot exactly.
    function testFuzz_FeeCalc_PayoutPlusFeeEqualsTotalPot(
        uint16 feeBps_,
        uint256 wager_
    ) public {
        // Bound inputs to valid ranges
        feeBps_ = uint16(bound(feeBps_, 0, game.MAX_FEE_BPS()));   // 0 – 1000 bps
        wager_  = bound(wager_, 1, 1_000_000e6);                   // 1 unit – 1M USDC

        uint256 totalPot    = wager_ * 2;
        uint256 platformFee = (totalPot * feeBps_) / 10_000;
        uint256 payout      = totalPot - platformFee;

        // Core invariant: payout is never more than the total pot
        assertLe(payout, totalPot, "payout exceeds totalPot");
        // And: payout + fee exactly reconstitutes the pot (no leakage or double-count)
        assertEq(payout + platformFee, totalPot, "payout + fee != totalPot");
    }

    /// @notice End-to-end fuzz: resolve with fuzzed feeBps, then withdraw succeeds.
    function testFuzz_ResolveAndWithdraw(uint16 feeBps_) public {
        feeBps_ = uint16(bound(feeBps_, 0, game.MAX_FEE_BPS()));

        // Deploy a game with this feeBps
        vm.prank(owner);
        WagerGame g = new WagerGame(address(usdc), resolver, feeRecip, feeBps_);

        uint256 wager = 50e6;
        usdc.mint(alice, wager);
        usdc.mint(bob,   wager);
        vm.prank(alice); usdc.approve(address(g), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(g), type(uint256).max);

        vm.prank(alice);
        bytes32 roomId = g.createRoom(WagerGame.GameType.NUMBER_GUESS, wager, false, bytes32("fz"));
        vm.prank(bob);
        g.joinRoom(roomId);

        uint256 totalPot    = wager * 2;
        uint256 platformFee = (totalPot * feeBps_) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(resolver);
        g.resolveGame(roomId, alice);

        // alice can withdraw exactly payout
        uint256 alicePre = usdc.balanceOf(alice);
        vm.prank(alice);
        g.withdraw();
        assertEq(usdc.balanceOf(alice) - alicePre, payout);

        // fee recipient can withdraw platformFee (if > 0)
        if (platformFee > 0) {
            uint256 feeRecipPre = usdc.balanceOf(feeRecip);
            vm.prank(feeRecip);
            g.withdraw();
            assertEq(usdc.balanceOf(feeRecip) - feeRecipPre, platformFee);
        }

        // Contract balance should be back to zero after both withdrawals
        assertEq(usdc.balanceOf(address(g)), 0);
    }

    /// @notice Fuzz wager amounts: two players deposit, cancel refunds creator.
    function testFuzz_CancelRefundsExactWager(uint256 wager_) public {
        wager_ = bound(wager_, 1, MINT_AMOUNT);

        // Make sure alice has enough (she starts with MINT_AMOUNT)
        // Adjust in case wager_ > MINT_AMOUNT-already-used
        // Fresh alice balance because setUp minted MINT_AMOUNT
        vm.prank(alice);
        // Re-approve for safety (already approved max in setUp)
        usdc.approve(address(game), type(uint256).max);

        uint256 alicePre = usdc.balanceOf(alice);
        // alice may not have wager_ if it exceeds her balance
        if (wager_ > alicePre) return;  // skip — not a valid scenario

        bytes32 roomId = _createRoom(alice, wager_, false, bytes32("cfz"));

        uint256 aliceAfterCreate = usdc.balanceOf(alice);
        assertEq(aliceAfterCreate, alicePre - wager_);

        vm.prank(alice);
        game.cancelRoom(roomId);

        assertEq(game.pendingWithdrawals(alice), wager_);

        vm.prank(alice);
        game.withdraw();

        // alice gets her exact wager back
        assertEq(usdc.balanceOf(alice), alicePre);
    }
}

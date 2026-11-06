// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WagerGameTestBase} from "./WagerGame.Base.t.sol";
import {WagerGame} from "../WagerGame.sol";

contract WagerGameDeployTest is WagerGameTestBase {
    // ── Constructor happy-path ───────────────────────────────────────────────

    function test_Deploy_SetsUsdcToken() public view {
        assertEq(address(game.usdcToken()), address(usdc));
    }

    function test_Deploy_SetsResolver() public view {
        assertEq(game.resolver(), resolver);
    }

    function test_Deploy_SetsFeeRecipient() public view {
        assertEq(game.feeRecipient(), feeRecip);
    }

    function test_Deploy_SetsFeeBps() public view {
        assertEq(game.feeBps(), INITIAL_FEE_BPS);
    }

    function test_Deploy_OwnerIsDeployer() public view {
        assertEq(game.owner(), owner);
    }

    // ── Constructor reverts ──────────────────────────────────────────────────

    function test_Deploy_RevertsZeroUsdc() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: usdc token is zero address");
        new WagerGame(address(0), resolver, feeRecip, INITIAL_FEE_BPS);
    }

    function test_Deploy_RevertsZeroResolver() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: resolver is zero address");
        new WagerGame(address(usdc), address(0), feeRecip, INITIAL_FEE_BPS);
    }

    function test_Deploy_RevertsZeroFeeRecipient() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: fee recipient is zero address");
        new WagerGame(address(usdc), resolver, address(0), INITIAL_FEE_BPS);
    }

    function test_Deploy_RevertsFeeTooBig() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: fee too high");
        new WagerGame(address(usdc), resolver, feeRecip, 1_001);
    }

    // ── Ownable2Step two-step transfer ───────────────────────────────────────

    function test_Ownable2Step_PendingOwnerMustAccept() public {
        // Step 1: owner nominates alice
        vm.prank(owner);
        game.transferOwnership(alice);
        // pendingOwner is alice, owner unchanged
        assertEq(game.pendingOwner(), alice);
        assertEq(game.owner(), owner);

        // Step 2: alice accepts
        vm.prank(alice);
        game.acceptOwnership();
        assertEq(game.owner(), alice);
        assertEq(game.pendingOwner(), address(0));
    }

    function test_Ownable2Step_NonPendingOwnerCannotAccept() public {
        vm.prank(owner);
        game.transferOwnership(alice);

        vm.prank(bob);
        vm.expectRevert();
        game.acceptOwnership();
    }
}

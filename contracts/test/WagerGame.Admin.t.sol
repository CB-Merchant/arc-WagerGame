// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WagerGameTestBase} from "./WagerGame.Base.t.sol";
import {WagerGame} from "../WagerGame.sol";

contract WagerGameAdminTest is WagerGameTestBase {
    address internal newResolver = makeAddr("newResolver");
    address internal newFeeRecip = makeAddr("newFeeRecip");

    // ═══════════════════════════════════════════════════════════════════════
    //  setResolver / applyResolver
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetResolver_HappyPath_StoresPending() public {
        vm.prank(owner);
        game.setResolver(newResolver);

        assertEq(game.pendingResolver(), newResolver);
        assertEq(game.resolverChangeAfter(), block.timestamp + game.RESOLVER_CHANGE_DELAY());
    }

    function test_ApplyResolver_HappyPath_AfterDelay() public {
        vm.prank(owner);
        game.setResolver(newResolver);

        vm.warp(block.timestamp + game.RESOLVER_CHANGE_DELAY());

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(game));
        emit WagerGame.ResolverUpdated(newResolver);
        game.applyResolver();

        assertEq(game.resolver(), newResolver);
        assertEq(game.pendingResolver(), address(0));
        assertEq(game.resolverChangeAfter(), 0);
    }

    function test_ApplyResolver_RevertsTooEarly() public {
        vm.prank(owner);
        game.setResolver(newResolver);

        // One second before delay expires
        vm.warp(block.timestamp + game.RESOLVER_CHANGE_DELAY() - 1);

        vm.prank(owner);
        vm.expectRevert("WagerGame: resolver change not ready");
        game.applyResolver();
    }

    function test_SetResolver_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: resolver is zero address");
        game.setResolver(address(0));
    }

    function test_SetResolver_RevertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setResolver(newResolver);
    }

    function test_ApplyResolver_RevertsNoPending() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: no pending resolver");
        game.applyResolver();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  setFeeBps / applyFeeBps
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetFeeBps_HappyPath_SetsPending() public {
        vm.prank(owner);
        game.setFeeBps(500);

        assertEq(game.pendingFeeBps(), 500);
        assertTrue(game.pendingFeeSet());
        assertEq(game.feeBpsChangeAfter(), block.timestamp + game.FEE_CHANGE_DELAY());
    }

    function test_ApplyFeeBps_HappyPath_AfterDelay() public {
        vm.prank(owner);
        game.setFeeBps(500);

        vm.warp(block.timestamp + game.FEE_CHANGE_DELAY());

        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(game));
        emit WagerGame.FeeBpsUpdated(500);
        game.applyFeeBps();

        assertEq(game.feeBps(), 500);
        assertFalse(game.pendingFeeSet());
        assertEq(game.feeBpsChangeAfter(), 0);
    }

    function test_ApplyFeeBps_RevertsTooEarly() public {
        vm.prank(owner);
        game.setFeeBps(500);

        vm.warp(block.timestamp + game.FEE_CHANGE_DELAY() - 1);

        vm.prank(owner);
        vm.expectRevert("WagerGame: fee change not ready");
        game.applyFeeBps();
    }

    function test_ApplyFeeBps_RevertsNoPendingFee() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: no pending fee change");
        game.applyFeeBps();
    }

    function test_SetFeeBps_RevertsTooHigh() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: fee too high");
        game.setFeeBps(1_001);
    }

    function test_SetFeeBps_RevertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setFeeBps(100);
    }

    function test_ApplyFeeBps_RevertsNonOwner() public {
        vm.prank(owner);
        game.setFeeBps(100);
        vm.warp(block.timestamp + game.FEE_CHANGE_DELAY());

        vm.prank(alice);
        vm.expectRevert();
        game.applyFeeBps();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  setFeeRecipient
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetFeeRecipient_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(game));
        emit WagerGame.FeeRecipientUpdated(newFeeRecip);
        game.setFeeRecipient(newFeeRecip);

        assertEq(game.feeRecipient(), newFeeRecip);
    }

    function test_SetFeeRecipient_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("WagerGame: fee recipient is zero address");
        game.setFeeRecipient(address(0));
    }

    function test_SetFeeRecipient_RevertsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setFeeRecipient(newFeeRecip);
    }
}

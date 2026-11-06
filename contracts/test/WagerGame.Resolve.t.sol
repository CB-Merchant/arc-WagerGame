// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WagerGameTestBase} from "./WagerGame.Base.t.sol";
import {WagerGame} from "../WagerGame.sol";

contract WagerGameResolveTest is WagerGameTestBase {
    // ═══════════════════════════════════════════════════════════════════════
    //  resolveGame
    // ═══════════════════════════════════════════════════════════════════════

    function test_ResolveGame_HappyPath_WinnerGetsCorrectPayout() public {
        bytes32 roomId = _activeRoom();    // alice vs bob, WAGER each

        uint256 totalPot    = WAGER * 2;
        uint256 platformFee = (totalPot * INITIAL_FEE_BPS) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(resolver);
        game.resolveGame(roomId, alice);

        assertEq(game.pendingWithdrawals(alice),   payout);
        assertEq(game.pendingWithdrawals(feeRecip), platformFee);

        // Room finished
        WagerGame.Room memory r = game.getRoom(roomId);
        assertEq(uint8(r.status), uint8(WagerGame.RoomStatus.FINISHED));
        assertEq(r.winner, alice);
    }

    function test_ResolveGame_EmitsEvent() public {
        bytes32 roomId = _activeRoom();

        uint256 totalPot    = WAGER * 2;
        uint256 platformFee = (totalPot * INITIAL_FEE_BPS) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(resolver);
        vm.expectEmit(true, true, false, true, address(game));
        emit WagerGame.GameResolved(roomId, alice, payout);
        game.resolveGame(roomId, alice);
    }

    function test_ResolveGame_ZeroFee_FullPotToWinner() public {
        // Deploy a fresh game with 0 feeBps
        vm.prank(owner);
        WagerGame zeroFeeGame = new WagerGame(address(usdc), resolver, feeRecip, 0);

        usdc.mint(alice, WAGER);
        usdc.mint(bob,   WAGER);
        vm.prank(alice); usdc.approve(address(zeroFeeGame), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(zeroFeeGame), type(uint256).max);

        vm.prank(alice);
        bytes32 roomId = zeroFeeGame.createRoom(WagerGame.GameType.RPS, WAGER, false, bytes32("z1"));
        vm.prank(bob);
        zeroFeeGame.joinRoom(roomId);

        vm.prank(resolver);
        zeroFeeGame.resolveGame(roomId, bob);

        assertEq(zeroFeeGame.pendingWithdrawals(bob),     WAGER * 2);
        assertEq(zeroFeeGame.pendingWithdrawals(feeRecip), 0);
    }

    function test_ResolveGame_RevertsNonResolver() public {
        bytes32 roomId = _activeRoom();

        vm.prank(alice);
        vm.expectRevert("WagerGame: caller is not resolver");
        game.resolveGame(roomId, alice);
    }

    function test_ResolveGame_RevertsRoomNotActive() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("ra1"));
        // room is WAITING not ACTIVE

        vm.prank(resolver);
        vm.expectRevert("WagerGame: room not active");
        game.resolveGame(roomId, alice);
    }

    function test_ResolveGame_RevertsInvalidWinner() public {
        bytes32 roomId = _activeRoom();

        vm.prank(resolver);
        vm.expectRevert("WagerGame: invalid winner");
        game.resolveGame(roomId, carol);   // carol not in room
    }

    function test_ResolveGame_RevertsRoomNotExist() public {
        vm.prank(resolver);
        vm.expectRevert("WagerGame: room does not exist");
        game.resolveGame(bytes32("ghost"), alice);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  withdraw
    // ═══════════════════════════════════════════════════════════════════════

    function test_Withdraw_HappyPath() public {
        bytes32 roomId = _activeRoom();
        uint256 totalPot    = WAGER * 2;
        uint256 platformFee = (totalPot * INITIAL_FEE_BPS) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(resolver);
        game.resolveGame(roomId, alice);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        game.withdraw();

        assertEq(usdc.balanceOf(alice),          aliceBefore + payout);
        assertEq(game.pendingWithdrawals(alice), 0);
    }

    function test_Withdraw_EmitsEvent() public {
        bytes32 roomId = _activeRoom();
        uint256 totalPot    = WAGER * 2;
        uint256 platformFee = (totalPot * INITIAL_FEE_BPS) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(resolver);
        game.resolveGame(roomId, alice);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(game));
        emit WagerGame.Withdrawn(alice, payout);
        game.withdraw();
    }

    function test_Withdraw_RevertsNothingToWithdraw() public {
        vm.prank(alice);
        vm.expectRevert("WagerGame: nothing to withdraw");
        game.withdraw();
    }

    function test_Withdraw_ReentrancySafe() public {
        // Standard ERC-20 can't re-enter; confirm the guard doesn't interfere
        // with a normal double-resolve → double-withdraw sequence.
        bytes32 room1 = _activeRoom();

        // Give carol enough to create second room
        _fundAndApprove(carol);
        bytes32 room2 = _createRoom(carol, WAGER, false, bytes32("re2"));
        vm.prank(bob);
        game.joinRoom(room2);

        vm.prank(resolver);
        game.resolveGame(room1, alice);
        vm.prank(resolver);
        game.resolveGame(room2, carol);

        // alice and carol can each withdraw exactly once
        uint256 totalPot    = WAGER * 2;
        uint256 platformFee = (totalPot * INITIAL_FEE_BPS) / 10_000;
        uint256 payout      = totalPot - platformFee;

        vm.prank(alice);
        game.withdraw();
        assertEq(game.pendingWithdrawals(alice), 0);
        assertEq(usdc.balanceOf(alice), MINT_AMOUNT - WAGER + payout);

        vm.prank(carol);
        game.withdraw();
        assertEq(game.pendingWithdrawals(carol), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  claimTimeout
    // ═══════════════════════════════════════════════════════════════════════

    function test_ClaimTimeout_HappyPath() public {
        bytes32 roomId = _activeRoom();

        // Warp past GAME_TIMEOUT (2 hours)
        vm.warp(block.timestamp + game.GAME_TIMEOUT());

        vm.prank(alice);
        game.claimTimeout(roomId);

        WagerGame.Room memory r = game.getRoom(roomId);
        assertEq(uint8(r.status), uint8(WagerGame.RoomStatus.CANCELLED));
        // Both players get refund
        assertEq(game.pendingWithdrawals(alice), WAGER);
        assertEq(game.pendingWithdrawals(bob),   WAGER);
    }

    function test_ClaimTimeout_Player2CanAlsoClaim() public {
        bytes32 roomId = _activeRoom();
        vm.warp(block.timestamp + game.GAME_TIMEOUT());

        vm.prank(bob);
        game.claimTimeout(roomId);

        assertEq(game.pendingWithdrawals(alice), WAGER);
        assertEq(game.pendingWithdrawals(bob),   WAGER);
    }

    function test_ClaimTimeout_EmitsEvent() public {
        bytes32 roomId = _activeRoom();
        vm.warp(block.timestamp + game.GAME_TIMEOUT());

        vm.prank(alice);
        vm.expectEmit(true, false, false, false, address(game));
        emit WagerGame.RoomCancelled(roomId);
        game.claimTimeout(roomId);
    }

    function test_ClaimTimeout_RevertsBeforeTimeout() public {
        bytes32 roomId = _activeRoom();

        // One second before timeout
        vm.warp(block.timestamp + game.GAME_TIMEOUT() - 1);

        vm.prank(alice);
        vm.expectRevert("WagerGame: game not timed out");
        game.claimTimeout(roomId);
    }

    function test_ClaimTimeout_RevertsRoomNotActive() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("ct3"));
        // room is WAITING

        vm.warp(block.timestamp + game.GAME_TIMEOUT() + 1);

        vm.prank(alice);
        vm.expectRevert("WagerGame: room not active");
        game.claimTimeout(roomId);
    }

    function test_ClaimTimeout_RevertsNonPlayer() public {
        bytes32 roomId = _activeRoom();
        vm.warp(block.timestamp + game.GAME_TIMEOUT());

        vm.prank(carol);
        vm.expectRevert("WagerGame: not a player");
        game.claimTimeout(roomId);
    }
}

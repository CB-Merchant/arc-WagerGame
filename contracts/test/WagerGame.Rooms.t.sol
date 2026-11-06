// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WagerGameTestBase} from "./WagerGame.Base.t.sol";
import {WagerGame} from "../WagerGame.sol";

contract WagerGameRoomsTest is WagerGameTestBase {
    // ═══════════════════════════════════════════════════════════════════════
    //  createRoom
    // ═══════════════════════════════════════════════════════════════════════

    function test_CreateRoom_HappyPath() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 gameBefore  = usdc.balanceOf(address(game));

        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("s1"));

        // USDC transferred in
        assertEq(usdc.balanceOf(alice),        aliceBefore - WAGER);
        assertEq(usdc.balanceOf(address(game)), gameBefore  + WAGER);

        // Room stored correctly
        WagerGame.Room memory r = game.getRoom(roomId);
        assertEq(r.player1,      alice);
        assertEq(r.player2,      address(0));
        assertEq(r.wagerAmount,  WAGER);
        assertEq(uint8(r.status), uint8(WagerGame.RoomStatus.WAITING));
        assertEq(r.createdAt,    block.timestamp);
        assertFalse(r.isPrivate);

        // Room appears in open public list
        bytes32[] memory open = game.getOpenPublicRooms();
        assertEq(open.length, 1);
        assertEq(open[0], roomId);
    }

    function test_CreateRoom_PrivateNotInOpenList() public {
        _createRoom(alice, WAGER, true, bytes32("s2"));
        assertEq(game.getOpenPublicRooms().length, 0);
    }

    function test_CreateRoom_EmitsEvent() public {
        bytes32 salt = bytes32("s3");
        // predict roomId: keccak256(abi.encodePacked(salt, alice, block.timestamp))
        bytes32 expectedRoomId = keccak256(abi.encodePacked(salt, alice, block.timestamp));

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(game));
        emit WagerGame.RoomCreated(expectedRoomId, alice, WagerGame.GameType.TRIVIA, WAGER, false);
        game.createRoom(WagerGame.GameType.TRIVIA, WAGER, false, salt);
    }

    function test_CreateRoom_PrivateEmitsZeroRoomId() public {
        bytes32 salt = bytes32("s4");

        vm.prank(alice);
        vm.expectEmit(false, true, false, true, address(game));
        emit WagerGame.RoomCreated(bytes32(0), alice, WagerGame.GameType.TRIVIA, WAGER, true);
        game.createRoom(WagerGame.GameType.TRIVIA, WAGER, true, salt);
    }

    function test_CreateRoom_RevertsZeroWager() public {
        vm.prank(alice);
        vm.expectRevert("WagerGame: wager must be > 0");
        game.createRoom(WagerGame.GameType.TRIVIA, 0, false, bytes32("s5"));
    }

    function test_CreateRoom_RevertsRoomAlreadyExists() public {
        // Same salt, same sender, same block.timestamp → same roomId
        bytes32 salt = bytes32("dup");
        _createRoom(alice, WAGER, false, salt);

        // Second call in the same block with the same params
        vm.prank(alice);
        vm.expectRevert("WagerGame: room already exists");
        game.createRoom(WagerGame.GameType.TRIVIA, WAGER, false, salt);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  joinRoom
    // ═══════════════════════════════════════════════════════════════════════

    function test_JoinRoom_HappyPath() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("j1"));

        uint256 bobBefore  = usdc.balanceOf(bob);
        uint256 gameBefore = usdc.balanceOf(address(game));

        vm.prank(bob);
        game.joinRoom(roomId);

        // USDC transferred in
        assertEq(usdc.balanceOf(bob),           bobBefore  - WAGER);
        assertEq(usdc.balanceOf(address(game)),  gameBefore + WAGER);

        // Room now ACTIVE
        WagerGame.Room memory r = game.getRoom(roomId);
        assertEq(r.player2,      bob);
        assertEq(uint8(r.status), uint8(WagerGame.RoomStatus.ACTIVE));
        assertEq(r.activeAt,     block.timestamp);

        // Room removed from open public list
        assertEq(game.getOpenPublicRooms().length, 0);
    }

    function test_JoinRoom_EmitsEvent() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("j2"));

        vm.prank(bob);
        vm.expectEmit(true, true, false, false, address(game));
        emit WagerGame.RoomJoined(roomId, bob);
        game.joinRoom(roomId);
    }

    function test_JoinRoom_RevertsOwnRoom() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("j3"));

        vm.prank(alice);
        vm.expectRevert("WagerGame: creator cannot join");
        game.joinRoom(roomId);
    }

    function test_JoinRoom_RevertsRoomNotExist() public {
        vm.prank(bob);
        vm.expectRevert("WagerGame: room does not exist");
        game.joinRoom(bytes32("nonexistent"));
    }

    function test_JoinRoom_RevertsRoomNotWaiting() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("j4"));
        vm.prank(bob);
        game.joinRoom(roomId);   // room is now ACTIVE

        vm.prank(carol);
        vm.expectRevert("WagerGame: room not waiting");
        game.joinRoom(roomId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  cancelRoom
    // ═══════════════════════════════════════════════════════════════════════

    function test_CancelRoom_HappyPath() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("c1"));

        vm.prank(alice);
        game.cancelRoom(roomId);

        // Status CANCELLED
        WagerGame.Room memory r = game.getRoom(roomId);
        assertEq(uint8(r.status), uint8(WagerGame.RoomStatus.CANCELLED));

        // Wager credited to alice
        assertEq(game.pendingWithdrawals(alice), WAGER);

        // Room removed from public list
        assertEq(game.getOpenPublicRooms().length, 0);
    }

    function test_CancelRoom_EmitsEvent() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("c2"));

        vm.prank(alice);
        vm.expectEmit(true, false, false, false, address(game));
        emit WagerGame.RoomCancelled(roomId);
        game.cancelRoom(roomId);
    }

    function test_CancelRoom_RevertsNonCreator() public {
        bytes32 roomId = _createRoom(alice, WAGER, false, bytes32("c3"));

        vm.prank(bob);
        vm.expectRevert("WagerGame: only creator can cancel");
        game.cancelRoom(roomId);
    }

    function test_CancelRoom_RevertsActiveRoom() public {
        bytes32 roomId = _activeRoom();   // alice + bob, ACTIVE

        vm.prank(alice);
        vm.expectRevert("WagerGame: room not waiting");
        game.cancelRoom(roomId);
    }
}

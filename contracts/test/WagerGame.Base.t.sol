// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {WagerGame} from "../WagerGame.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

abstract contract WagerGameTestBase is Test {
    // ── Actors ──────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal resolver = makeAddr("resolver");
    address internal feeRecip = makeAddr("feeRecipient");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal carol    = makeAddr("carol");

    // ── Constants ───────────────────────────────────────────────────────────
    uint16  internal constant INITIAL_FEE_BPS = 200;          // 2 %
    uint256 internal constant WAGER           = 100e6;        // 100 USDC
    uint256 internal constant MINT_AMOUNT     = 10_000e6;     // per actor

    // ── Contracts ───────────────────────────────────────────────────────────
    MockERC20  internal usdc;
    WagerGame  internal game;

    // ── Setup ────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // Deploy mock USDC (6 decimals)
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy WagerGame from owner
        vm.prank(owner);
        game = new WagerGame(address(usdc), resolver, feeRecip, INITIAL_FEE_BPS);

        // Fund actors and approve game
        _fundAndApprove(alice);
        _fundAndApprove(bob);
        _fundAndApprove(carol);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _fundAndApprove(address actor) internal {
        usdc.mint(actor, MINT_AMOUNT);
        vm.prank(actor);
        usdc.approve(address(game), type(uint256).max);
    }

    /// Create a public room as alice and return its roomId.
    function _createRoom(
        address creator,
        uint256 wager,
        bool isPrivate,
        bytes32 salt
    ) internal returns (bytes32 roomId) {
        vm.prank(creator);
        roomId = game.createRoom(WagerGame.GameType.TRIVIA, wager, isPrivate, salt);
    }

    /// Create + join a public room (alice creates, bob joins). Returns roomId.
    function _activeRoom() internal returns (bytes32 roomId) {
        roomId = _createRoom(alice, WAGER, false, bytes32("salt1"));
        vm.prank(bob);
        game.joinRoom(roomId);
    }
}

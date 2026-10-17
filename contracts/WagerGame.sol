// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract WagerGame is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum GameType {
        TRIVIA,
        RPS,
        NUMBER_GUESS,
        TICTACTOE
    }

    enum RoomStatus {
        WAITING,
        ACTIVE,
        FINISHED,
        CANCELLED
    }

    struct Room {
        bytes32 roomId;
        address player1;
        address player2;
        uint256 wagerAmount;
        GameType gameType;
        bool isPrivate;
        RoomStatus status;
        address winner;
        uint256 createdAt;
        uint256 activeAt;
    }

    event RoomCreated(
        bytes32 indexed roomId,
        address indexed player1,
        GameType gameType,
        uint256 wagerAmount,
        bool isPrivate
    );
    event RoomJoined(bytes32 indexed roomId, address indexed player2);
    event GameResolved(bytes32 indexed roomId, address indexed winner, uint256 payout);
    event RoomCancelled(bytes32 indexed roomId);

    event ResolverUpdated(address indexed resolver);
    event FeeBpsUpdated(uint16 feeBps);
    event FeeRecipientUpdated(address indexed feeRecipient);

    uint16 public constant MAX_FEE_BPS = 1_000;
    uint256 public constant GAME_TIMEOUT = 2 hours;

    IERC20 public immutable usdcToken;
    address public resolver;
    address public feeRecipient;
    uint16 public feeBps;

    mapping(bytes32 => Room) public rooms;
    bytes32[] public openPublicRoomIds;

    // Stores index + 1 for room IDs present in openPublicRoomIds.
    mapping(bytes32 => uint256) private _roomIndex;

    modifier onlyResolver() {
        require(msg.sender == resolver, "WagerGame: caller is not resolver");
        _;
    }

    constructor(address usdcToken_, address resolver_, address feeRecipient_, uint16 feeBps_) Ownable(msg.sender) {
        require(usdcToken_ != address(0), "WagerGame: usdc token is zero address");
        require(resolver_ != address(0), "WagerGame: resolver is zero address");
        require(feeRecipient_ != address(0), "WagerGame: fee recipient is zero address");
        require(feeBps_ <= MAX_FEE_BPS, "WagerGame: fee too high");

        usdcToken = IERC20(usdcToken_);
        resolver = resolver_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    function createRoom(
        GameType gameType,
        uint256 wagerAmount,
        bool isPrivate,
        bytes32 salt
    ) external nonReentrant returns (bytes32 roomId) {
        require(wagerAmount > 0, "WagerGame: wager must be > 0");

        roomId = keccak256(abi.encodePacked(salt, msg.sender, block.timestamp));
        require(rooms[roomId].createdAt == 0, "WagerGame: room already exists");

        uint256 balanceBefore = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), wagerAmount);
        uint256 balanceAfter = usdcToken.balanceOf(address(this));
        require(balanceAfter - balanceBefore == wagerAmount, "WagerGame: transfer amount mismatch");

        rooms[roomId] = Room({
            roomId: roomId,
            player1: msg.sender,
            player2: address(0),
            wagerAmount: wagerAmount,
            gameType: gameType,
            isPrivate: isPrivate,
            status: RoomStatus.WAITING,
            winner: address(0),
            createdAt: block.timestamp,
            activeAt: 0
        });

        if (!isPrivate) {
            _addOpenPublicRoom(roomId);
        }

        emit RoomCreated(isPrivate ? bytes32(0) : roomId, msg.sender, gameType, wagerAmount, isPrivate);
    }

    function joinRoom(bytes32 roomId) external nonReentrant {
        Room storage room = rooms[roomId];

        require(room.createdAt != 0, "WagerGame: room does not exist");
        require(room.status == RoomStatus.WAITING, "WagerGame: room not waiting");
        require(room.player2 == address(0), "WagerGame: room already joined");
        require(msg.sender != room.player1, "WagerGame: creator cannot join");

        uint256 balanceBefore = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), room.wagerAmount);
        uint256 balanceAfter = usdcToken.balanceOf(address(this));
        require(balanceAfter - balanceBefore == room.wagerAmount, "WagerGame: transfer amount mismatch");

        room.player2 = msg.sender;
        room.status = RoomStatus.ACTIVE;
        room.activeAt = block.timestamp;

        if (!room.isPrivate) {
            _removeOpenPublicRoom(roomId);
        }

        emit RoomJoined(roomId, msg.sender);
    }

    function resolveGame(bytes32 roomId, address winner) external onlyResolver nonReentrant {
        Room storage room = rooms[roomId];

        require(room.createdAt != 0, "WagerGame: room does not exist");
        require(room.status == RoomStatus.ACTIVE, "WagerGame: room not active");
        require(winner == room.player1 || winner == room.player2, "WagerGame: invalid winner");

        uint256 totalPot = room.wagerAmount * 2;
        uint256 platformFee = (totalPot * feeBps) / 10_000;
        uint256 payout = totalPot - platformFee;

        room.status = RoomStatus.FINISHED;
        room.winner = winner;

        usdcToken.safeTransfer(winner, payout);
        if (platformFee > 0) {
            usdcToken.safeTransfer(feeRecipient, platformFee);
        }

        emit GameResolved(roomId, winner, payout);
    }

    function cancelRoom(bytes32 roomId) external nonReentrant {
        Room storage room = rooms[roomId];

        require(room.createdAt != 0, "WagerGame: room does not exist");
        require(msg.sender == room.player1, "WagerGame: only creator can cancel");
        require(room.status == RoomStatus.WAITING, "WagerGame: room not waiting");

        room.status = RoomStatus.CANCELLED;

        if (!room.isPrivate) {
            _removeOpenPublicRoom(roomId);
        }

        usdcToken.safeTransfer(room.player1, room.wagerAmount);

        emit RoomCancelled(roomId);
    }

    function claimTimeout(bytes32 roomId) external nonReentrant {
        Room storage room = rooms[roomId];
        require(room.createdAt != 0, "WagerGame: room does not exist");
        require(room.status == RoomStatus.ACTIVE, "WagerGame: room not active");
        require(msg.sender == room.player1 || msg.sender == room.player2, "WagerGame: not a player");
        require(block.timestamp >= room.activeAt + GAME_TIMEOUT, "WagerGame: game not timed out");

        room.status = RoomStatus.CANCELLED;

        uint256 refundEach = room.wagerAmount;
        usdcToken.safeTransfer(room.player1, refundEach);
        usdcToken.safeTransfer(room.player2, refundEach);

        emit RoomCancelled(roomId);
    }

    function getRoom(bytes32 roomId) external view returns (Room memory) {
        return rooms[roomId];
    }

    function getOpenPublicRooms() external view returns (bytes32[] memory) {
        return openPublicRoomIds;
    }

    function setResolver(address newResolver) external onlyOwner {
        require(newResolver != address(0), "WagerGame: resolver is zero address");
        resolver = newResolver;
        emit ResolverUpdated(newResolver);
    }

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "WagerGame: fee too high");
        feeBps = newFeeBps;
        emit FeeBpsUpdated(newFeeBps);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "WagerGame: fee recipient is zero address");
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    function _addOpenPublicRoom(bytes32 roomId) private {
        require(_roomIndex[roomId] == 0, "WagerGame: room already listed");
        openPublicRoomIds.push(roomId);
        _roomIndex[roomId] = openPublicRoomIds.length;
    }

    function _removeOpenPublicRoom(bytes32 roomId) private {
        uint256 indexPlusOne = _roomIndex[roomId];
        require(indexPlusOne != 0, "WagerGame: room not listed");

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = openPublicRoomIds.length - 1;

        if (index != lastIndex) {
            bytes32 lastRoomId = openPublicRoomIds[lastIndex];
            openPublicRoomIds[index] = lastRoomId;
            _roomIndex[lastRoomId] = index + 1;
        }

        openPublicRoomIds.pop();
        delete _roomIndex[roomId];
    }
}

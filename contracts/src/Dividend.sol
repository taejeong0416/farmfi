// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./FarmToken.sol";

contract Dividend is ReentrancyGuard, AccessControl {
    FarmToken public farmToken;

    uint256 public currentRound;

    struct DividendRound {
        uint256 totalAmount;
        uint256 perToken;   // wei per token
        uint256 timestamp;
        uint256 snapshotBlock; // 배당 기준 블록 — 이후 취득분은 이 회차 청구 불가
    }

    mapping(uint256 => DividendRound) public rounds;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event DividendDistributed(uint256 indexed round, uint256 totalAmount, uint256 perToken);
    event DividendClaimed(address indexed investor, uint256 indexed round, uint256 amount);

    constructor(address farmToken_) {
        farmToken = FarmToken(farmToken_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function distributeDividend() external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        require(msg.value > 0, "Must send ETH");
        uint256 supply = farmToken.totalSupply();
        require(supply > 0, "No tokens issued");

        currentRound++;
        uint256 perToken = msg.value / supply;

        rounds[currentRound] = DividendRound({
            totalAmount: msg.value,
            perToken: perToken,
            timestamp: block.timestamp,
            snapshotBlock: block.number
        });

        emit DividendDistributed(currentRound, msg.value, perToken);
    }

    function claimDividend(uint256 round) external nonReentrant {
        require(round >= 1 && round <= currentRound, "Invalid round");
        require(!claimed[round][msg.sender], "Already claimed");

        // 스냅샷 잔고 기준 — 배당 발표 후 매수자가 청구하는 취약점 차단.
        uint256 balance = farmToken.balanceOfAt(msg.sender, rounds[round].snapshotBlock);
        require(balance > 0, "No tokens held");

        uint256 amount = balance * rounds[round].perToken;
        require(amount > 0, "Nothing to claim");

        claimed[round][msg.sender] = true;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");

        emit DividendClaimed(msg.sender, round, amount);
    }

    receive() external payable {}
}

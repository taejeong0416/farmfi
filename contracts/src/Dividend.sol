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
            timestamp: block.timestamp
        });

        emit DividendDistributed(currentRound, msg.value, perToken);
    }

    function claimDividend(uint256 round) external nonReentrant {
        require(round >= 1 && round <= currentRound, "Invalid round");
        require(!claimed[round][msg.sender], "Already claimed");

        uint256 balance = farmToken.balanceOf(msg.sender);
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

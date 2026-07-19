// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./FarmToken.sol";

interface IRoundGate {
    function isOpen(address site) external view returns (bool);
}

contract Escrow is ReentrancyGuard, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // 운영사가 실패 선언을 미루면 자금이 영구 동결되는 데드락 방지 —
    // 마감 경과 후에는 누구나 실패 전환을 트리거할 수 있다.
    uint256 public constant MILESTONE_TIMEOUT = 180 days;

    FarmToken public farmToken;
    address public operator;

    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public remaining;

    uint256 public tokenPrice; // wei per token
    uint256 public milestoneCount;
    uint256 public currentMilestone; // next milestone seq to release (1-based)
    uint256 public milestoneDeadline; // current milestone must be released by this time
    address public roundGate; // optional: pilot-first gating for round sites (0 = ungated)
    bool public projectFailed;

    struct Milestone {
        string name;
        uint256 releasePct;   // basis points (3500 = 35%)
        uint256 releaseAmount;
        bool verified;
        bool released;
    }

    mapping(uint256 => Milestone) public milestones;
    mapping(address => uint256) public investments; // investor => total wei invested

    event Subscribed(address indexed investor, uint256 amount, uint256 tokenAmount);
    event MilestoneVerified(uint256 indexed seq, bool passed);
    event TrancheReleased(uint256 indexed seq, uint256 amount, address indexed operator);
    event ProjectFailed();
    event ProjectTimedOut(uint256 indexed milestoneSeq);
    event RoundGateSet(address indexed gate);
    event Refunded(address indexed investor, uint256 amount);

    constructor(
        address farmToken_,
        address operator_,
        uint256 tokenPrice_,
        string[] memory milestoneNames_,
        uint256[] memory milestonePcts_
    ) {
        require(milestoneNames_.length == milestonePcts_.length, "Length mismatch");

        farmToken = FarmToken(farmToken_);
        operator = operator_;
        tokenPrice = tokenPrice_;
        milestoneCount = milestoneNames_.length;
        currentMilestone = 1;
        milestoneDeadline = block.timestamp + MILESTONE_TIMEOUT;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        uint256 totalPct;
        for (uint256 i = 0; i < milestoneNames_.length; i++) {
            uint256 seq = i + 1;
            milestones[seq] = Milestone({
                name: milestoneNames_[i],
                releasePct: milestonePcts_[i],
                releaseAmount: 0, // calculated on subscribe
                verified: false,
                released: false
            });
            totalPct += milestonePcts_[i];
        }
        require(totalPct == 10000, "Pcts must sum to 10000");
    }

    function subscribe() external payable nonReentrant {
        require(!projectFailed, "Project failed");
        require(currentMilestone == 1, "Funding closed");
        require(msg.value > 0, "Must send ETH");
        require(msg.value % tokenPrice == 0, "Must be multiple of token price");

        uint256 tokenAmount = msg.value / tokenPrice;
        require(farmToken.totalSupply() + tokenAmount <= farmToken.maxSupply(), "Sold out");

        totalLocked += msg.value;
        remaining += msg.value;
        investments[msg.sender] += msg.value;

        // Recalculate release amounts for each milestone
        for (uint256 i = 1; i <= milestoneCount; i++) {
            milestones[i].releaseAmount = (totalLocked * milestones[i].releasePct) / 10000;
        }

        farmToken.mint(msg.sender, tokenAmount);

        emit Subscribed(msg.sender, msg.value, tokenAmount);
    }

    function verifyMilestone(uint256 seq, bool passed) external onlyRole(VERIFIER_ROLE) {
        require(seq >= 1 && seq <= milestoneCount, "Invalid seq");
        milestones[seq].verified = passed;
        emit MilestoneVerified(seq, passed);
    }

    function releaseTranche(uint256 seq) external nonReentrant {
        require(!projectFailed, "Project failed");
        require(seq == currentMilestone, "Wrong sequence");
        require(milestones[seq].verified, "Not verified");
        require(!milestones[seq].released, "Already released");
        // 라운드 게이트: 파일럿(1호점)이 전 마일스톤을 통과하기 전에는
        // 나머지 사이트의 자금 집행이 열리지 않는다 (게이트 미설정 시 무제한).
        require(
            roundGate == address(0) || IRoundGate(roundGate).isOpen(address(this)),
            "Round gate closed"
        );

        uint256 amount = milestones[seq].releaseAmount;
        require(amount > 0, "Nothing to release");
        require(remaining >= amount, "Insufficient balance");

        milestones[seq].released = true;
        totalReleased += amount;
        remaining -= amount;
        currentMilestone++;
        milestoneDeadline = block.timestamp + MILESTONE_TIMEOUT;

        (bool sent, ) = operator.call{value: amount}("");
        require(sent, "Transfer failed");

        emit TrancheReleased(seq, amount, operator);
    }

    function markFailed() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!projectFailed, "Already failed");
        projectFailed = true;
        emit ProjectFailed();
    }

    /// @notice 게이트는 자금 집행 전(첫 트랜치 해제 전) 1회만 설정 가능.
    function setRoundGate(address gate_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(roundGate == address(0), "Gate already set");
        require(currentMilestone == 1 && !milestones[1].released, "Funds already moving");
        roundGate = gate_;
        emit RoundGateSet(gate_);
    }

    /// @notice 마감 경과 시 누구나(투자자 포함) 실패 전환 가능 — admin 선의에
    ///         의존하지 않는 탈출구. 완료된 프로젝트에는 적용되지 않는다.
    function triggerTimeoutFailure() external {
        require(!projectFailed, "Already failed");
        require(currentMilestone <= milestoneCount, "Project completed");
        require(block.timestamp > milestoneDeadline, "Deadline not passed");
        projectFailed = true;
        emit ProjectTimedOut(currentMilestone);
        emit ProjectFailed();
    }

    function refund() external nonReentrant {
        require(projectFailed, "Project not failed");

        uint256 invested = investments[msg.sender];
        require(invested > 0, "No investment");

        // Proportional refund of remaining funds
        uint256 refundAmount = (invested * remaining) / totalLocked;
        require(refundAmount > 0, "Nothing to refund");

        investments[msg.sender] = 0;
        totalLocked -= invested;
        remaining -= refundAmount;

        (bool sent, ) = msg.sender.call{value: refundAmount}("");
        require(sent, "Transfer failed");

        emit Refunded(msg.sender, refundAmount);
    }

    receive() external payable {}
}

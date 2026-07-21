// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";

contract EscrowTest is Test {
    FarmToken token;
    Escrow escrow;

    address deployer = address(this);
    address operator = makeAddr("operator");
    address verifier = makeAddr("verifier");
    address investor = makeAddr("investor");

    uint256 constant TOKEN_PRICE = 0.1 ether;

    string[] milestoneNames;
    uint256[] milestonePcts;

    function setUp() public {
        // Deploy FarmToken (maxSupply = 1000)
        token = new FarmToken("FarmToken", "FTK", 1000);

        // Build milestone arrays
        milestoneNames.push("Space Prep");
        milestoneNames.push("Trial Run");
        milestoneNames.push("First Harvest");
        milestoneNames.push("Sustained Ops");

        milestonePcts.push(3500);
        milestonePcts.push(3000);
        milestonePcts.push(2000);
        milestonePcts.push(1500);

        // Deploy Escrow
        escrow = new Escrow(
            address(token),
            operator,
            TOKEN_PRICE,
            milestoneNames,
            milestonePcts
        );

        // Grant MINTER_ROLE to Escrow so it can mint tokens on subscribe
        token.grantRole(token.MINTER_ROLE(), address(escrow));

        // Grant VERIFIER_ROLE to verifier
        escrow.grantRole(escrow.VERIFIER_ROLE(), verifier);

        // Fund investor
        vm.deal(investor, 100 ether);
    }

    // ---------------------------------------------------------------
    // 검증 명제 ① : releaseTranche reverts when milestone NOT verified
    // ---------------------------------------------------------------
    function test_releaseTranche_revertsWhenNotVerified() public {
        // Investor subscribes so there are funds locked
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        // Attempt to release tranche 1 without verification
        vm.expectRevert("Not verified");
        escrow.releaseTranche(1);
    }

    // ---------------------------------------------------------------
    // 검증 명제 ② : verifyMilestone reverts when caller lacks VERIFIER_ROLE
    // ---------------------------------------------------------------
    function test_verifyMilestone_revertsWithoutVerifierRole() public {
        address nobody = makeAddr("nobody");

        vm.prank(nobody);
        vm.expectRevert();
        escrow.verifyMilestone(1, true);
    }

    // ---------------------------------------------------------------
    // 검증 명제 ③ : After verification, releaseTranche succeeds and sends
    //              funds to operator
    // ---------------------------------------------------------------
    function test_releaseTranche_succeedsAfterVerification() public {
        // Subscribe
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        // Verify milestone 1
        vm.prank(verifier);
        escrow.verifyMilestone(1, true);

        // Record operator balance before release
        uint256 balBefore = operator.balance;

        // Release tranche 1
        escrow.releaseTranche(1);

        // Operator should have received 35% of 1 ether
        uint256 expected = (1 ether * 3500) / 10000;
        assertEq(operator.balance - balBefore, expected, "Operator did not receive correct amount");
    }

    // ---------------------------------------------------------------
    // Sequence skip: releasing seq 2 before seq 1 should revert
    // ---------------------------------------------------------------
    function test_releaseTranche_revertsOnSequenceSkip() public {
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        // Verify milestone 2 (but not releasing milestone 1 first)
        vm.prank(verifier);
        escrow.verifyMilestone(2, true);

        // Attempt to release seq 2 while currentMilestone is still 1
        vm.expectRevert("Wrong sequence");
        escrow.releaseTranche(2);
    }

    // ---------------------------------------------------------------
    // refund: only callable after admin marks the project failed
    // ---------------------------------------------------------------
    function test_refund_revertsWhenNotFailed() public {
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        vm.prank(investor);
        vm.expectRevert("Project not failed");
        escrow.refund();
    }

    function test_refund_proportionalAfterFailure() public {
        address investor2 = makeAddr("investor2");
        vm.deal(investor2, 100 ether);

        // investor 6 ETH, investor2 4 ETH → totalLocked 10 ETH
        vm.prank(investor);
        escrow.subscribe{value: 6 ether}();
        vm.prank(investor2);
        escrow.subscribe{value: 4 ether}();

        // Release milestone 1 (35%) → remaining 6.5 ETH
        vm.prank(verifier);
        escrow.verifyMilestone(1, true);
        escrow.releaseTranche(1);

        escrow.markFailed();

        // investor: 6 * 6.5 / 10 = 3.9 ETH
        uint256 bal1Before = investor.balance;
        vm.prank(investor);
        escrow.refund();
        assertEq(investor.balance - bal1Before, 3.9 ether);

        // investor2: 4 * 2.6 / 4 = 2.6 ETH (same as 4 * 6.5 / 10)
        uint256 bal2Before = investor2.balance;
        vm.prank(investor2);
        escrow.refund();
        assertEq(investor2.balance - bal2Before, 2.6 ether);

        assertEq(escrow.remaining(), 0);
        assertEq(escrow.totalLocked(), 0);
    }

    function test_failedProject_blocksSubscribeAndRelease() public {
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        vm.prank(verifier);
        escrow.verifyMilestone(1, true);

        escrow.markFailed();

        vm.prank(investor);
        vm.expectRevert("Project failed");
        escrow.subscribe{value: 1 ether}();

        vm.expectRevert("Project failed");
        escrow.releaseTranche(1);
    }

    // ---------------------------------------------------------------
    // subscribe: closed once the first tranche has been released
    // ---------------------------------------------------------------
    function test_subscribe_revertsAfterFirstRelease() public {
        vm.prank(investor);
        escrow.subscribe{value: 1 ether}();

        vm.prank(verifier);
        escrow.verifyMilestone(1, true);
        escrow.releaseTranche(1);

        vm.prank(investor);
        vm.expectRevert("Funding closed");
        escrow.subscribe{value: 1 ether}();
    }

    // ---------------------------------------------------------------
    // Full scenario: subscribe → verify/release all 4 → remaining == 0
    // ---------------------------------------------------------------
    function test_fullScenario() public {
        uint256 investAmount = 10 ether; // 100 tokens at 0.1 ether each

        // Subscribe
        vm.prank(investor);
        escrow.subscribe{value: investAmount}();

        // Verify token minting
        assertEq(token.balanceOf(investor), 100);

        uint256 operatorBalBefore = operator.balance;

        // Milestone 1: Space Prep (35%)
        vm.prank(verifier);
        escrow.verifyMilestone(1, true);
        escrow.releaseTranche(1);

        // Milestone 2: Trial Run (30%)
        vm.prank(verifier);
        escrow.verifyMilestone(2, true);
        escrow.releaseTranche(2);

        // Milestone 3: First Harvest (20%)
        vm.prank(verifier);
        escrow.verifyMilestone(3, true);
        escrow.releaseTranche(3);

        // Milestone 4: Sustained Ops (15%)
        vm.prank(verifier);
        escrow.verifyMilestone(4, true);
        escrow.releaseTranche(4);

        // All funds released
        assertEq(escrow.remaining(), 0, "remaining should be 0");
        assertEq(escrow.totalReleased(), investAmount, "totalReleased should equal invested amount");
        assertEq(operator.balance - operatorBalBefore, investAmount, "Operator should have received all funds");
    }
}

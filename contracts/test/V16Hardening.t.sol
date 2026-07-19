// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";
import "../src/Dividend.sol";
import "../src/RoundGate.sol";

/// @dev v16 하드닝 3종 검증 — ① 마일스톤 타임아웃(운영사 선의 비의존 탈출구),
///      ② 라운드 게이트(1호점 실증 전 나머지 사이트 집행 차단),
///      ③ 배당 스냅샷(배당 발표 후 취득분 청구 차단).
contract V16HardeningTest is Test {
    uint256 constant TOKEN_PRICE = 0.001 ether;

    address operator = makeAddr("operator");
    address investor1 = makeAddr("investor1");
    address investor2 = makeAddr("investor2");
    address stranger = makeAddr("stranger");

    function _names() internal pure returns (string[] memory names) {
        names = new string[](4);
        names[0] = "Space Prep";
        names[1] = "Trial Run";
        names[2] = "First Harvest";
        names[3] = "Sustained Ops";
    }

    function _pcts() internal pure returns (uint256[] memory pcts) {
        pcts = new uint256[](4);
        pcts[0] = 3500;
        pcts[1] = 3000;
        pcts[2] = 2000;
        pcts[3] = 1500;
    }

    function _newSite(FarmToken token) internal returns (Escrow) {
        Escrow e = new Escrow(address(token), operator, TOKEN_PRICE, _names(), _pcts());
        token.grantRole(token.MINTER_ROLE(), address(e));
        e.grantRole(e.VERIFIER_ROLE(), address(this));
        return e;
    }

    function _completeAllMilestones(Escrow e) internal {
        for (uint256 seq = 1; seq <= 4; seq++) {
            e.verifyMilestone(seq, true);
            e.releaseTranche(seq);
        }
    }

    // ── ① 타임아웃 ──────────────────────────────────────────────

    function test_timeout_beforeDeadline_reverts() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);

        vm.prank(stranger);
        vm.expectRevert("Deadline not passed");
        e.triggerTimeoutFailure();
    }

    function test_timeout_afterDeadline_anyoneCanTrigger_thenFullRefund() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}();

        // 아무것도 집행되지 않은 채 마감 경과 — 제3자(투자자 아님)도 트리거 가능
        vm.warp(block.timestamp + e.MILESTONE_TIMEOUT() + 1);
        vm.prank(stranger);
        e.triggerTimeoutFailure();
        assertTrue(e.projectFailed());

        // 미집행 상태이므로 전액 환불
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        e.refund();
        assertEq(investor1.balance - balBefore, 0.1 ether);
    }

    function test_timeout_deadlineRefreshesOnRelease() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}();

        // 마감 직전에 마일스톤 1 집행 → 마감이 갱신되어 타임아웃 불가
        vm.warp(block.timestamp + e.MILESTONE_TIMEOUT() - 1 hours);
        e.verifyMilestone(1, true);
        e.releaseTranche(1);

        vm.warp(block.timestamp + 2 hours); // 원래 마감은 지났지만 갱신됨
        vm.expectRevert("Deadline not passed");
        e.triggerTimeoutFailure();
    }

    function test_timeout_afterCompletion_reverts() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}();

        _completeAllMilestones(e);

        vm.warp(block.timestamp + e.MILESTONE_TIMEOUT() + 1);
        vm.expectRevert("Project completed");
        e.triggerTimeoutFailure();
    }

    // ── ② 라운드 게이트 ─────────────────────────────────────────

    function test_roundGate_blocksSiteUntilPilotCompletes() public {
        FarmToken pilotToken = new FarmToken("Pilot", "P01", 1000);
        FarmToken siteToken = new FarmToken("Site2", "S02", 1000);
        Escrow pilot = _newSite(pilotToken);
        Escrow site2 = _newSite(siteToken);

        RoundGate gate = new RoundGate();
        gate.setPilot(address(pilot));
        gate.addSite(address(site2));
        pilot.setRoundGate(address(gate));
        site2.setRoundGate(address(gate));

        vm.deal(investor1, 2 ether);
        vm.startPrank(investor1);
        pilot.subscribe{value: 0.1 ether}();
        site2.subscribe{value: 0.1 ether}(); // 청약(모집)은 게이트와 무관
        vm.stopPrank();

        // 파일럿 미완주 상태 — site2 집행 차단
        site2.verifyMilestone(1, true);
        vm.expectRevert("Round gate closed");
        site2.releaseTranche(1);

        // 파일럿은 자기 자신에게 항상 열려 있음 — 완주
        _completeAllMilestones(pilot);
        assertTrue(gate.pilotCompleted());

        // 이제 site2 집행 가능
        site2.releaseTranche(1);
        (, , , , bool released) = site2.milestones(1);
        assertTrue(released);
    }

    function test_roundGate_failedPilotKeepsGateClosed() public {
        FarmToken pilotToken = new FarmToken("Pilot", "P01", 1000);
        FarmToken siteToken = new FarmToken("Site2", "S02", 1000);
        Escrow pilot = _newSite(pilotToken);
        Escrow site2 = _newSite(siteToken);

        RoundGate gate = new RoundGate();
        gate.setPilot(address(pilot));
        site2.setRoundGate(address(gate));

        vm.deal(investor1, 2 ether);
        vm.startPrank(investor1);
        pilot.subscribe{value: 0.1 ether}();
        site2.subscribe{value: 0.1 ether}();
        vm.stopPrank();

        pilot.markFailed(); // 파일럿 실패 → 게이트 영구 폐쇄

        site2.verifyMilestone(1, true);
        vm.expectRevert("Round gate closed");
        site2.releaseTranche(1);

        // site2 투자자는 미집행 전액을 환불받는 경로로 나간다
        vm.warp(block.timestamp + site2.MILESTONE_TIMEOUT() + 1);
        site2.triggerTimeoutFailure();
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        site2.refund();
        assertEq(investor1.balance - balBefore, 0.1 ether);
    }

    function test_roundGate_cannotSetAfterFundsMoving() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}();

        e.verifyMilestone(1, true);
        e.releaseTranche(1);

        RoundGate gate = new RoundGate();
        vm.expectRevert("Funds already moving");
        e.setRoundGate(address(gate));
    }

    // ── ③ 배당 스냅샷 ───────────────────────────────────────────

    function test_snapshot_buyerAfterDistributionCannotClaim() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);
        Dividend dividend = new Dividend(address(token));

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}(); // investor1: 100 tokens

        dividend.distributeDividend{value: 1 ether}();

        // 배당 발표 다음 블록에 전량 양도
        vm.roll(block.number + 1);
        vm.prank(investor1);
        assertTrue(token.transfer(investor2, 100));
        assertEq(token.balanceOf(investor2), 100);

        // 양수인(investor2)은 스냅샷 잔고 0 → 청구 불가
        vm.prank(investor2);
        vm.expectRevert("No tokens held");
        dividend.claimDividend(1);

        // 양도인(investor1)은 현재 잔고 0이어도 스냅샷 기준 전액 수령
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        dividend.claimDividend(1);
        assertEq(investor1.balance - balBefore, 1 ether);
    }

    function test_snapshot_laterRoundUsesLaterBalances() public {
        FarmToken token = new FarmToken("Farm", "FARM", 1000);
        Escrow e = _newSite(token);
        Dividend dividend = new Dividend(address(token));

        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        e.subscribe{value: 0.1 ether}(); // 100 tokens

        dividend.distributeDividend{value: 1 ether}(); // round 1: investor1 100%

        vm.roll(block.number + 1);
        vm.prank(investor1);
        assertTrue(token.transfer(investor2, 40)); // 이후 60/40 분할

        vm.roll(block.number + 1);
        dividend.distributeDividend{value: 1 ether}(); // round 2: 60/40 기준

        uint256 bal1Before = investor1.balance;
        vm.prank(investor1);
        dividend.claimDividend(2);
        assertEq(investor1.balance - bal1Before, 0.6 ether);

        uint256 bal2Before = investor2.balance;
        vm.prank(investor2);
        dividend.claimDividend(2);
        assertEq(investor2.balance - bal2Before, 0.4 ether);
    }
}

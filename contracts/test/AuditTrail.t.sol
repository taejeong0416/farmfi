// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AuditTrail.sol";

contract AuditTrailTest is Test {
    AuditTrail trail;
    address relay = address(0xBEEF);
    address stranger = address(0xDEAD);

    bytes32 constant PROJECT = keccak256("project:1");
    bytes32 constant HASH = keccak256("doc");

    function setUp() public {
        trail = new AuditTrail();
        trail.grantRole(trail.RELAY_ROLE(), relay);
    }

    // ─── 멱등 — Outbox 재시도가 정상 동작이라 두 번째 호출이 터지면 안 된다 ───

    /// 같은 eventId를 두 번 보내도 기록은 하나다
    function test_sameEventId_recordedOnce() public {
        bytes32 id = keccak256("agreement:1");
        vm.startPrank(relay);
        trail.registerAgreement(id, PROJECT, keccak256("inv"), HASH, 1);
        trail.registerAgreement(id, PROJECT, keccak256("inv"), HASH, 1); // 재시도
        vm.stopPrank();

        assertTrue(trail.recorded(id));
        assertEq(trail.entryCount(), 1, unicode"재시도가 건수를 늘리면 대사가 깨진다");
    }

    /// 재시도는 revert하지 않는다 — 터지면 Outbox가 영원히 실패로 남는다
    function test_retry_doesNotRevert() public {
        bytes32 id = keccak256("payout:1");
        vm.startPrank(relay);
        trail.recordPayout(id, PROJECT, keccak256("p"), keccak256("payee"), 1000, keccak256("bank"));
        // revert하면 Outbox가 영원히 실패로 남는다.
        trail.recordPayout(id, PROJECT, keccak256("p"), keccak256("payee"), 1000, keccak256("bank"));
        vm.stopPrank();
        assertEq(trail.entryCount(), 1);
    }

    /// 서로 다른 eventId는 따로 쌓인다
    function test_distinctEventIds_accumulate() public {
        vm.startPrank(relay);
        trail.confirmDeposit(keccak256("d1"), PROJECT, keccak256("r1"), 100);
        trail.confirmDeposit(keccak256("d2"), PROJECT, keccak256("r2"), 200);
        vm.stopPrank();
        assertEq(trail.entryCount(), 2);
    }

    // ─── 권한 — 명세 9.5: 프론트엔드·투자자는 체인을 직접 호출하지 못한다 ───

    /// RELAY_ROLE 없으면 거부된다
    function test_withoutRelayRole_reverts() public {
        vm.prank(stranger);
        vm.expectRevert();
        trail.confirmDeposit(keccak256("d"), PROJECT, keccak256("r"), 100);
    }

    /// 여섯 함수 모두 권한을 요구한다
    function test_allSixFunctions_requireRole() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        trail.registerAgreement(keccak256("a"), PROJECT, HASH, HASH, 1);
        vm.expectRevert();
        trail.confirmDeposit(keccak256("b"), PROJECT, HASH, 1);
        vm.expectRevert();
        trail.submitEvidenceHash(keccak256("c"), PROJECT, 1, HASH);
        vm.expectRevert();
        trail.recordDisbursement(keccak256("d"), PROJECT, 1, 1, HASH);
        vm.expectRevert();
        trail.confirmSettlement(keccak256("e"), PROJECT, HASH, 1, HASH);
        vm.expectRevert();
        trail.recordPayout(keccak256("f"), PROJECT, HASH, HASH, 1, HASH);
        vm.stopPrank();
        assertEq(trail.entryCount(), 0);
    }

    // ─── 입력 검증 ───

    /// eventId가 0이면 거부된다
    function test_zeroEventId_reverts() public {
        vm.prank(relay);
        vm.expectRevert("AuditTrail: zero eventId");
        trail.confirmDeposit(bytes32(0), PROJECT, HASH, 100);
    }

    /// 금액 0인 기록은 거부된다
    function test_zeroAmount_reverts() public {
        vm.startPrank(relay);
        vm.expectRevert("AuditTrail: zero amount");
        trail.confirmDeposit(keccak256("x"), PROJECT, HASH, 0);
        vm.expectRevert("AuditTrail: zero amount");
        trail.recordPayout(keccak256("y"), PROJECT, HASH, HASH, 0, HASH);
        vm.stopPrank();
    }

    /// 해시가 0이면 거부된다
    function test_zeroHash_reverts() public {
        vm.startPrank(relay);
        vm.expectRevert("AuditTrail: zero hash");
        trail.submitEvidenceHash(keccak256("x"), PROJECT, 1, bytes32(0));
        vm.expectRevert("AuditTrail: zero hash");
        trail.registerAgreement(keccak256("y"), PROJECT, HASH, bytes32(0), 1);
        vm.stopPrank();
    }

    /// 정산액 0은 정상이다 — 적자 기간이면 배분 가능액이 0이고, 그 사실도 기록해야 한다.
    /// 정산액 0은 정상이다 — 적자 기간이면 0이고 그 사실도 남겨야 한다
    function test_zeroDistributable_isRecorded() public {
        vm.prank(relay);
        trail.confirmSettlement(keccak256("s"), PROJECT, HASH, 0, HASH);
        assertEq(trail.entryCount(), 1);
    }

    // ─── 현금 미보관 (명세 0.2) ───

    /// 이 컨트랙트는 돈을 받지 못한다 (명세 0.2)
    function test_cannotReceiveEther() public {
        vm.deal(relay, 1 ether);
        vm.prank(relay);
        (bool sent, ) = address(trail).call{value: 1 ether}("");
        assertFalse(sent, unicode"payable/receive가 생기면 명세 0.2가 깨진다");
        assertEq(address(trail).balance, 0);
    }

    // ─── 이벤트가 실제로 나가는가 ───

    /// 증빙 해시 이벤트가 나간다
    function test_evidenceEvent_isEmitted() public {
        bytes32 id = keccak256("ev:1");
        vm.expectEmit(true, true, false, true);
        emit AuditTrail.EvidenceSubmitted(id, PROJECT, 3, HASH);
        vm.prank(relay);
        trail.submitEvidenceHash(id, PROJECT, 3, HASH);
    }
    /// 구좌 회수는 기록으로 남는다 (§9.1 반대 이벤트)
    function test_holdingReversal_isRecorded() public {
        bytes32 id = keccak256("reversal:1");
        vm.expectEmit(true, true, false, true);
        emit AuditTrail.HoldingReversed(id, PROJECT, keccak256("inv"), 120, keccak256("refund"));
        vm.prank(relay);
        trail.recordHoldingReversal(id, PROJECT, keccak256("inv"), 120, keccak256("refund"));
        assertEq(trail.entryCount(), 1);
    }

    function test_zeroUnitsReversal_reverts() public {
        vm.prank(relay);
        vm.expectRevert("AuditTrail: zero units");
        trail.recordHoldingReversal(keccak256("r0"), PROJECT, HASH, 0, HASH);
    }
}

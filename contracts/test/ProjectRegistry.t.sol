// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ProjectRegistry.sol";

contract ProjectRegistryTest is Test {
    ProjectRegistry reg;
    address relay = address(0xBEEF);
    address stranger = address(0xDEAD);

    bytes32 constant P = keccak256("project:1");
    bytes32 constant DOC = keccak256("contract-v1");
    bytes32 constant DOC2 = keccak256("contract-v2");
    bytes32 constant ECON = keccak256("v18");

    function setUp() public {
        reg = new ProjectRegistry();
        reg.grantRole(reg.RELAY_ROLE(), relay);
        vm.prank(relay);
        reg.registerProject(keccak256("e1"), P, DOC, ECON, keccak256("space"), keccak256("op"), 1, 100);
    }

    /// 등록하면 계약서 해시가 체인에서 조회된다 — 이게 이 컨트랙트의 존재 이유다
    function test_registeredContract_isQueryable() public view {
        assertTrue(reg.isCurrentContract(P, DOC));
        assertFalse(reg.isCurrentContract(P, DOC2));
        assertEq(reg.projectCount(), 1);
    }

    /// 0 해시는 unicode"계약서 없음"과 구분되지 않으므로 통과시키면 안 된다
    function test_zeroHash_neverMatches() public view {
        assertFalse(reg.isCurrentContract(P, bytes32(0)));
        assertFalse(reg.isCurrentContract(keccak256("missing-project"), bytes32(0)));
    }

    /// 같은 프로젝트를 두 번 등록할 수 없다 — 재등록으로 계약서를 갈아치우는 길을 막는다
    function test_reRegister_reverts() public {
        vm.prank(relay);
        vm.expectRevert("ProjectRegistry: already registered");
        reg.registerProject(keccak256("e2"), P, DOC2, ECON, bytes32(0), bytes32(0), 1, 200);
        assertTrue(reg.isCurrentContract(P, DOC));
    }

    /// 개정은 허용하되 이전 해시가 이벤트에 남는다 — 조용한 교체를 막는 지점
    function test_amend_keepsPreviousHashInEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ProjectRegistry.ContractAmended(keccak256("e3"), P, DOC, DOC2, ECON, ECON);
        vm.prank(relay);
        reg.amendContract(keccak256("e3"), P, DOC2, ECON);

        assertTrue(reg.isCurrentContract(P, DOC2));
        assertFalse(reg.isCurrentContract(P, DOC), unicode"옛 계약서가 현행으로 남으면 안 된다");
        (, , , , , , uint256 amendments) = reg.projects(P);
        assertEq(amendments, 1);
    }

    function test_stateChange_isRecorded() public {
        vm.prank(relay);
        reg.setState(keccak256("e4"), P, 3);
        (, , , , uint8 state, , ) = reg.projects(P);
        assertEq(state, 3);
    }

    function test_unregisteredProject_cannotAmendOrSetState() public {
        bytes32 ghost = keccak256("ghost");
        vm.startPrank(relay);
        vm.expectRevert("ProjectRegistry: not registered");
        reg.amendContract(keccak256("e5"), ghost, DOC2, ECON);
        vm.expectRevert("ProjectRegistry: not registered");
        reg.setState(keccak256("e6"), ghost, 2);
        vm.stopPrank();
    }

    function test_withoutRelayRole_reverts() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        reg.registerProject(keccak256("x"), keccak256("p2"), DOC, ECON, bytes32(0), bytes32(0), 1, 1);
        vm.expectRevert();
        reg.amendContract(keccak256("y"), P, DOC2, ECON);
        vm.expectRevert();
        reg.setState(keccak256("z"), P, 2);
        vm.stopPrank();
    }

    /// 재시도가 상태를 두 번 바꾸면 안 된다
    function test_sameEventId_amendsOnce() public {
        vm.startPrank(relay);
        reg.amendContract(keccak256("e7"), P, DOC2, ECON);
        reg.amendContract(keccak256("e7"), P, keccak256("contract-v3"), ECON);
        vm.stopPrank();
        assertTrue(reg.isCurrentContract(P, DOC2), unicode"재시도가 개정을 한 번 더 먹이면 안 된다");
        (, , , , , , uint256 amendments) = reg.projects(P);
        assertEq(amendments, 1);
    }

    function test_cannotReceiveEther() public {
        vm.deal(relay, 1 ether);
        vm.prank(relay);
        (bool sent, ) = address(reg).call{value: 1 ether}("");
        assertFalse(sent);
    }
    // ─── 투자안 (기획 0826 슬라이드 36·37) ───

    /// 회수 조건이 체인에서 조회된다 — 화면 숫자와 맞춰볼 수 있다
    function test_terms_areQueryable() public {
        vm.prank(relay);
        reg.setInvestmentTerms(keccak256("t1"), P, 600, 24, 80_000_000);
        assertTrue(reg.isCurrentTerms(P, 600, 24, 80_000_000));
        assertFalse(reg.isCurrentTerms(P, 600, 18, 80_000_000), unicode"기간이 다르면 거짓");
        assertFalse(reg.isCurrentTerms(P, 800, 24, 80_000_000), unicode"프리미엄이 다르면 거짓");
    }

    /// 한 번 박으면 다시 못 박는다 — 조건을 통째로 갈아치우는 길을 막는다
    function test_terms_cannotBeReset() public {
        vm.startPrank(relay);
        reg.setInvestmentTerms(keccak256("t2"), P, 600, 24, 80_000_000);
        vm.expectRevert("ProjectRegistry: terms already set");
        reg.setInvestmentTerms(keccak256("t3"), P, 1200, 12, 80_000_000);
        vm.stopPrank();
        assertTrue(reg.isCurrentTerms(P, 600, 24, 80_000_000));
    }

    /// 기간 연장은 허용한다 — 실적이 안 나올 때 최대 36개월(슬라이드 37 각주)
    function test_recovery_canExtendUpTo36() public {
        vm.startPrank(relay);
        reg.setInvestmentTerms(keccak256("t4"), P, 600, 24, 80_000_000);
        reg.extendRecovery(keccak256("t5"), P, 36);
        vm.stopPrank();
        assertTrue(reg.isCurrentTerms(P, 600, 36, 80_000_000));
    }

    /// 기간 단축은 거부한다 — 투자자가 받을 기간을 조용히 깎을 수 없다
    function test_recovery_cannotShorten() public {
        vm.startPrank(relay);
        reg.setInvestmentTerms(keccak256("t6"), P, 600, 24, 80_000_000);
        vm.expectRevert("ProjectRegistry: cannot shorten");
        reg.extendRecovery(keccak256("t7"), P, 18);
        vm.expectRevert("ProjectRegistry: exceeds 36 months");
        reg.extendRecovery(keccak256("t8"), P, 48);
        vm.stopPrank();
        assertTrue(reg.isCurrentTerms(P, 600, 24, 80_000_000));
    }

    /// 등록되지 않은 프로젝트에는 조건을 박을 수 없다
    function test_terms_requireRegisteredProject() public {
        vm.prank(relay);
        vm.expectRevert("ProjectRegistry: not registered");
        reg.setInvestmentTerms(keccak256("t9"), keccak256("ghost"), 600, 24, 80_000_000);
    }

    function test_terms_requireRelayRole() public {
        vm.prank(stranger);
        vm.expectRevert();
        reg.setInvestmentTerms(keccak256("tA"), P, 600, 24, 80_000_000);
    }

    /// 재시도가 조건을 두 번 먹이지 않는다
    function test_terms_sameEventIdIsIdempotent() public {
        vm.startPrank(relay);
        reg.setInvestmentTerms(keccak256("tB"), P, 600, 24, 80_000_000);
        reg.extendRecovery(keccak256("tC"), P, 30);
        reg.extendRecovery(keccak256("tC"), P, 36); // 같은 eventId — 무시돼야 한다
        vm.stopPrank();
        assertTrue(reg.isCurrentTerms(P, 600, 30, 80_000_000));
    }

    function test_terms_rejectBadInputs() public {
        vm.startPrank(relay);
        vm.expectRevert("ProjectRegistry: zero premium");
        reg.setInvestmentTerms(keccak256("tD"), P, 0, 24, 80_000_000);
        vm.expectRevert("ProjectRegistry: bad months");
        reg.setInvestmentTerms(keccak256("tE"), P, 600, 48, 80_000_000);
        vm.expectRevert("ProjectRegistry: zero principal");
        reg.setInvestmentTerms(keccak256("tF"), P, 600, 24, 0);
        vm.stopPrank();
    }
}

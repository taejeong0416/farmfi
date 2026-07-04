// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";

/// @dev 퍼즈 핸들러 — invariant 러너가 무작위로 호출하는 액션들을 유효 범위로
///      바운드해 대부분의 호출이 의미 있는 상태 전이를 만들도록 한다.
///      "실제로 들어온 돈"과 "실제로 나간 환불"을 컨트랙트 밖에서 독립 합산(ghost)해,
///      컨트랙트 내부 회계가 이 진실값과 어긋나지 않는지 검증하는 기준으로 쓴다.
contract EscrowHandler is Test {
    FarmToken public token;
    Escrow public escrow;

    address[3] public actors;

    uint256 public ghost_deposited; // 청약으로 실제 들어온 총 wei
    uint256 public ghost_refunded; // 환불로 실제 나간 총 wei

    constructor(FarmToken token_, Escrow escrow_) {
        token = token_;
        escrow = escrow_;
        actors[0] = makeAddr("inv0");
        actors[1] = makeAddr("inv1");
        actors[2] = makeAddr("inv2");
        // 투자자에게 자금 지급 — 프랭크 중 msg.value는 투자자 잔고에서 빠지므로,
        // 안 넣으면 subscribe가 전부 OutOfFunds로 revert해 검증이 공허해진다.
        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1_000_000 ether);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    // 청약 — 토큰 단가 배수 · 잔여 공급량 안에서만. msg.sender는 투자자로 프랭크.
    function subscribe(uint256 actorSeed, uint256 tokenAmt) public {
        if (escrow.projectFailed() || escrow.currentMilestone() != 1) return;
        uint256 supplyLeft = token.maxSupply() - token.totalSupply();
        if (supplyLeft == 0) return;
        uint256 cap = supplyLeft < 1000 ? supplyLeft : 1000;
        tokenAmt = bound(tokenAmt, 1, cap);
        uint256 value = tokenAmt * escrow.tokenPrice();

        vm.prank(_actor(actorSeed));
        escrow.subscribe{value: value}();
        ghost_deposited += value;
    }

    // 마일스톤 검증 통과 기록 (핸들러가 VERIFIER_ROLE 보유).
    function verify(uint256 seq) public {
        seq = bound(seq, 1, escrow.milestoneCount());
        escrow.verifyMilestone(seq, true);
    }

    // 현재 순번 트랜치 해제 — 조건 충족 시에만.
    function release() public {
        uint256 seq = escrow.currentMilestone();
        if (escrow.projectFailed() || seq > escrow.milestoneCount()) return;
        (, , uint256 releaseAmount, bool verified_, bool released_) = escrow.milestones(seq);
        if (!verified_ || released_ || releaseAmount == 0) return;
        if (escrow.remaining() < releaseAmount) return;
        escrow.releaseTranche(seq);
    }

    // 프로젝트 실패 선언 (핸들러가 DEFAULT_ADMIN_ROLE 보유) — 입금이 쌓인 뒤에만
    // 발동해 환불 경로가 실제로 exercise 되도록 한다.
    function markFail() public {
        if (escrow.projectFailed() || ghost_deposited == 0) return;
        escrow.markFailed();
    }

    // 비례 환불 — 실패 상태 + 투자금 보유 시에만. 실제 나간 금액을 잔고 델타로 측정.
    function refund(uint256 actorSeed) public {
        if (!escrow.projectFailed()) return;
        address actor = _actor(actorSeed);
        if (escrow.investments(actor) == 0) return;
        uint256 balBefore = actor.balance;
        vm.prank(actor);
        try escrow.refund() {
            ghost_refunded += actor.balance - balBefore;
        } catch {}
    }

    // 강제 ETH 유입(selfdestruct/coinbase) 시뮬레이션 — 내부 회계와 실제 잔고가
    // 어긋나도 solvency가 유지되는지 확인용. 회계 변수는 건드리지 않는다.
    function forceSend(uint256 amount) public {
        amount = bound(amount, 0, 10 ether);
        vm.deal(address(escrow), address(escrow).balance + amount);
    }
}

/// @dev Escrow 회계 불변식 — 퍼즈로 액션을 무작위 조합해도 아래 두 명제가 깨지지 않아야 한다.
///  1) solvency: 잔고 ≥ 내부가 "빚졌다"고 기록한 remaining
///  2) 자금 보존: 들어온 총액 == 운영자 지급 + 투자자 환불 + 잔여
contract EscrowInvariantTest is Test {
    FarmToken token;
    Escrow escrow;
    EscrowHandler handler;

    uint256 constant TOKEN_PRICE = 0.1 ether;

    function setUp() public {
        token = new FarmToken("FarmToken", "FTK", 1_000_000);

        string[] memory names = new string[](4);
        names[0] = "Space Prep";
        names[1] = "Trial Run";
        names[2] = "First Harvest";
        names[3] = "Sustained Ops";
        uint256[] memory pcts = new uint256[](4);
        pcts[0] = 3500;
        pcts[1] = 3000;
        pcts[2] = 2000;
        pcts[3] = 1500;

        escrow = new Escrow(address(token), makeAddr("operator"), TOKEN_PRICE, names, pcts);
        token.grantRole(token.MINTER_ROLE(), address(escrow));

        handler = new EscrowHandler(token, escrow);
        escrow.grantRole(escrow.VERIFIER_ROLE(), address(handler));
        escrow.grantRole(escrow.DEFAULT_ADMIN_ROLE(), address(handler));

        // 핸들러 액션 6종만 퍼징 대상으로 (자동 생성 getter 등 제외)
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.subscribe.selector;
        selectors[1] = handler.verify.selector;
        selectors[2] = handler.release.selector;
        selectors[3] = handler.markFail.selector;
        selectors[4] = handler.refund.selector;
        selectors[5] = handler.forceSend.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// 잔고는 항상 remaining 이상 — 강제 ETH가 들어와도 지급 능력은 깨지지 않는다
    /// (내부 accounting을 진실로 신뢰하는 설계의 안전성).
    function invariant_solventForRemaining() public view {
        assertGe(address(escrow).balance, escrow.remaining());
    }

    /// 자금 보존 법칙 — 환불 경로를 포함해도 1 wei도 새거나 증발하지 않는다.
    function invariant_fundsConserved() public view {
        assertEq(
            handler.ghost_deposited(),
            escrow.totalReleased() + handler.ghost_refunded() + escrow.remaining()
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * SettlementLedger / AuditTrail (명세 v2.1 §9.1)
 *
 * 명세 0.3이 체인에 요구하는 것은 "투자계약, 단계별 집행, 정산 계산 결과, 원화 이체
 * 결과의 변경 방지 기록"이다. Escrow(집행 게이트)·FarmToken(보유 원장)이 담지 않는
 * 나머지 다섯 가지를 여기서 받는다.
 *
 * 원칙 셋 — 명세를 그대로 옮긴 것이라 바꾸면 명세가 깨진다.
 *
 * 1. **현금을 쥐지 않는다** (§0.2). 이 컨트랙트에 payable 함수는 없다. 금액은 숫자로만
 *    남고 실제 이체는 은행이 한다. Dividend.sol이 ETH를 옮기려 한 것과 다른 노선이다.
 * 2. **원문을 올리지 않는다** (§9.2). 계좌번호·이름·CI가 들어갈 자리는 전부 bytes32
 *    참조값이다. 서버가 해시해서 넘기고, 체인은 그게 무엇인지 모른다.
 * 3. **Chain Relay만 쓴다** (§9.5). 프론트엔드·투자자는 호출할 수 없다.
 *
 * 멱등은 §9.4의 eventId 규약을 따른다. 같은 eventId가 두 번 오면 revert하지 않고
 * 조용히 무시한다 — Outbox 재시도가 정상 동작이고, 거기서 터지면 재시도가 영원히
 * 실패로 남기 때문이다. 처리 여부는 recorded()로 확인한다.
 */
contract AuditTrail is AccessControl {
    bytes32 public constant RELAY_ROLE = keccak256("RELAY_ROLE");

    /// 이미 기록된 eventId. Outbox 재전송을 흡수한다.
    mapping(bytes32 => bool) public recorded;

    /// 기록 건수 — 대사(reconciliation)가 체인 쪽 총량을 읽는 자리.
    uint256 public entryCount;

    event AgreementRegistered(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 investorRef,
        bytes32 agreementHash,
        uint256 agreedAt
    );

    event DepositConfirmed(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 depositRef,
        uint256 amount
    );

    event EvidenceSubmitted(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        uint256 milestoneSeq,
        bytes32 evidenceHash
    );

    event DisbursementRecorded(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        uint256 milestoneSeq,
        uint256 amount,
        bytes32 bankRef
    );

    event SettlementConfirmed(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 periodRef,
        uint256 distributable,
        bytes32 ruleHash
    );

    event PayoutRecorded(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 payoutRef,
        bytes32 payeeRef,
        uint256 amount,
        bytes32 bankRef
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAY_ROLE, msg.sender);
    }

    /// @dev 새 eventId면 true. 이미 처리했으면 false — 호출부가 조용히 빠져나간다.
    function _claim(bytes32 eventId) private returns (bool) {
        require(eventId != bytes32(0), "AuditTrail: zero eventId");
        if (recorded[eventId]) return false;
        recorded[eventId] = true;
        entryCount++;
        return true;
    }

    /// @notice 계약 동의 기록 (§9.6 registerAgreement — 선행조건: 본인확인·계약 동의 완료)
    function registerAgreement(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 investorRef,
        bytes32 agreementHash,
        uint256 agreedAt
    ) external onlyRole(RELAY_ROLE) {
        require(agreementHash != bytes32(0), "AuditTrail: zero hash");
        if (!_claim(eventId)) return;
        emit AgreementRegistered(eventId, projectRef, investorRef, agreementHash, agreedAt);
    }

    /// @notice 입금 확인 기록 (§9.6 confirmDeposit — 선행조건: 은행 입금 검증 완료)
    function confirmDeposit(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 depositRef,
        uint256 amount
    ) external onlyRole(RELAY_ROLE) {
        require(amount > 0, "AuditTrail: zero amount");
        if (!_claim(eventId)) return;
        emit DepositConfirmed(eventId, projectRef, depositRef, amount);
    }

    /// @notice 증빙 해시 기록 (§9.6 submitEvidenceHash — 선행조건: 운영자 자격 유효)
    /// @dev 원본 파일은 Object Storage에 있고 여기엔 sha256만 온다. 사후에 파일을
    ///      다시 해시해 이 값과 맞춰보면 교체 여부를 알 수 있다.
    function submitEvidenceHash(
        bytes32 eventId,
        bytes32 projectRef,
        uint256 milestoneSeq,
        bytes32 evidenceHash
    ) external onlyRole(RELAY_ROLE) {
        require(evidenceHash != bytes32(0), "AuditTrail: zero hash");
        if (!_claim(eventId)) return;
        emit EvidenceSubmitted(eventId, projectRef, milestoneSeq, evidenceHash);
    }

    /// @notice 조성비 지급 결과 기록 (§9.6 recordDisbursement — 선행조건: 마일스톤 승인·은행 지급 성공)
    function recordDisbursement(
        bytes32 eventId,
        bytes32 projectRef,
        uint256 milestoneSeq,
        uint256 amount,
        bytes32 bankRef
    ) external onlyRole(RELAY_ROLE) {
        require(amount > 0, "AuditTrail: zero amount");
        if (!_claim(eventId)) return;
        emit DisbursementRecorded(eventId, projectRef, milestoneSeq, amount, bankRef);
    }

    /// @notice 정산 확정 기록 (§9.6 confirmSettlement — 선행조건: 매출·비용 검증 완료)
    /// @param distributable 배분 가능액. 재원은 FarmFi 수수료 풀이고 운영자 매출이 아니다.
    /// @param ruleHash 적용한 정산 규칙의 해시 — 나중에 규칙을 바꿔도 그때 뭘 썼는지 남는다.
    function confirmSettlement(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 periodRef,
        uint256 distributable,
        bytes32 ruleHash
    ) external onlyRole(RELAY_ROLE) {
        if (!_claim(eventId)) return;
        emit SettlementConfirmed(eventId, projectRef, periodRef, distributable, ruleHash);
    }

    /// @notice 지급 결과 기록 (§9.6 recordPayout — 선행조건: 정산 확정·은행 지급 성공)
    /// @dev payeeRef는 수취인 내부 식별자의 해시다. 이름·계좌번호는 올라오지 않는다.
    function recordPayout(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 payoutRef,
        bytes32 payeeRef,
        uint256 amount,
        bytes32 bankRef
    ) external onlyRole(RELAY_ROLE) {
        require(amount > 0, "AuditTrail: zero amount");
        if (!_claim(eventId)) return;
        emit PayoutRecorded(eventId, projectRef, payoutRef, payeeRef, amount, bankRef);
    }
}

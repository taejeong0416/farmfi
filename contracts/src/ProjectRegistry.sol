// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * ProjectRegistry (명세 v2.1 §9.1)
 *
 * "프로젝트 생성·상태 변경, 공간·운영자·관리자 식별값 연결, 단위경제 모델 버전과
 * 계약서 해시 저장."
 *
 * 이 컨트랙트가 지키려는 것은 하나다 — **계약서를 나중에 고쳐 쓸 수 없게 만드는 것.**
 * 투자자가 동의한 조건과 지금 조건이 같은지 서버 말고 체인이 답한다.
 *
 * 그래서 개정을 금지하지 않고 **개정 이력을 남긴다.** 조건은 바뀔 수 있다. 바뀐 걸
 * 숨길 수 없어야 한다. amendContract가 이전 해시와 새 해시를 함께 이벤트로 흘린다.
 *
 * 원칙은 AuditTrail과 같다 — payable 없음(§0.2), 원문 대신 bytes32 참조값(§9.2),
 * RELAY_ROLE만 호출(§9.5), eventId 멱등(§9.4).
 */
contract ProjectRegistry is AccessControl {
    bytes32 public constant RELAY_ROLE = keccak256("RELAY_ROLE");

    struct Project {
        bytes32 contractHash;      // 계약서 해시 — 투자자가 동의한 문서의 지문
        bytes32 economicsVersion;  // 단위경제 모델 버전
        bytes32 spaceRef;
        bytes32 operatorRef;
        uint8 state;               // 서버 상태 기계의 코드. 0은 미등록.
        uint256 registeredAt;
        uint256 amendments;        // 계약서가 몇 번 개정됐나
    }

    /**
     * 투자안 — 투자자가 받기로 한 회수 조건 (기획 0826 슬라이드 36·37).
     *
     * 계약서 해시만으로는 "그 문서 안의 숫자"를 체인이 답하지 못한다. 회수 조건은
     * 투자자가 얼마를 언제까지 받느냐를 정하는 값이라, 조용히 바뀌면 안 된다.
     * 그래서 프로젝트와 함께 박고, 바꾸려면 이력을 남기게 한다.
     *
     * 기간 연장은 허용한다 — 실적이 안 나오면 최대 36개월까지 늘리는 게 기획이다.
     * 다만 **프리미엄을 낮추거나 기간을 줄이는 변경은 거부한다.** 투자자에게
     * 불리한 방향으로 조용히 되돌리는 길을 막는다.
     */
    struct InvestmentTerms {
        uint16 annualPremiumBp;  // 연 프리미엄 (basis point, 600 = 6%)
        uint16 recoveryMonths;   // 회수 기간(개월)
        uint256 principal;       // 투자 원금(원)
        uint256 setAt;
    }

    mapping(bytes32 => InvestmentTerms) public terms;
    mapping(bytes32 => Project) public projects;
    mapping(bytes32 => bool) public recorded;
    uint256 public projectCount;

    event ProjectRegistered(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 contractHash,
        bytes32 economicsVersion,
        bytes32 spaceRef,
        bytes32 operatorRef,
        uint256 registeredAt
    );

    event ProjectStateChanged(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        uint8 previousState,
        uint8 newState
    );

    event TermsSet(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        uint16 annualPremiumBp,
        uint16 recoveryMonths,
        uint256 principal
    );

    /// 회수 기간이 늘어난 사실. 이전 값을 함께 흘린다.
    event RecoveryExtended(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        uint16 previousMonths,
        uint16 newMonths
    );

    /// 계약서가 바뀌었다는 사실. 이전 해시를 함께 흘려 조용한 교체를 막는다.
    event ContractAmended(
        bytes32 indexed eventId,
        bytes32 indexed projectRef,
        bytes32 previousContractHash,
        bytes32 newContractHash,
        bytes32 previousEconomicsVersion,
        bytes32 newEconomicsVersion
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAY_ROLE, msg.sender);
    }

    function _claim(bytes32 eventId) private returns (bool) {
        require(eventId != bytes32(0), "ProjectRegistry: zero eventId");
        if (recorded[eventId]) return false;
        recorded[eventId] = true;
        return true;
    }

    /// @notice 프로젝트를 등록한다. 이미 등록된 프로젝트는 거절한다 — 재등록은 개정이다.
    function registerProject(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 contractHash,
        bytes32 economicsVersion,
        bytes32 spaceRef,
        bytes32 operatorRef,
        uint8 state,
        uint256 registeredAt
    ) external onlyRole(RELAY_ROLE) {
        require(projectRef != bytes32(0), "ProjectRegistry: zero projectRef");
        require(contractHash != bytes32(0), "ProjectRegistry: zero contractHash");
        require(state != 0, "ProjectRegistry: zero state");
        if (!_claim(eventId)) return;
        require(
            projects[projectRef].contractHash == bytes32(0),
            "ProjectRegistry: already registered"
        );

        projects[projectRef] = Project({
            contractHash: contractHash,
            economicsVersion: economicsVersion,
            spaceRef: spaceRef,
            operatorRef: operatorRef,
            state: state,
            registeredAt: registeredAt,
            amendments: 0
        });
        projectCount++;

        emit ProjectRegistered(
            eventId,
            projectRef,
            contractHash,
            economicsVersion,
            spaceRef,
            operatorRef,
            registeredAt
        );
    }

    /// @notice 프로젝트 상태 전환을 기록한다.
    function setState(
        bytes32 eventId,
        bytes32 projectRef,
        uint8 newState
    ) external onlyRole(RELAY_ROLE) {
        require(newState != 0, "ProjectRegistry: zero state");
        require(
            projects[projectRef].contractHash != bytes32(0),
            "ProjectRegistry: not registered"
        );
        if (!_claim(eventId)) return;

        uint8 previous = projects[projectRef].state;
        projects[projectRef].state = newState;
        emit ProjectStateChanged(eventId, projectRef, previous, newState);
    }

    /// @notice 계약서·단위경제 개정을 기록한다. 이전 값이 이벤트에 남는다.
    function amendContract(
        bytes32 eventId,
        bytes32 projectRef,
        bytes32 newContractHash,
        bytes32 newEconomicsVersion
    ) external onlyRole(RELAY_ROLE) {
        require(newContractHash != bytes32(0), "ProjectRegistry: zero contractHash");
        Project storage p = projects[projectRef];
        require(p.contractHash != bytes32(0), "ProjectRegistry: not registered");
        if (!_claim(eventId)) return;

        bytes32 prevHash = p.contractHash;
        bytes32 prevVersion = p.economicsVersion;
        p.contractHash = newContractHash;
        p.economicsVersion = newEconomicsVersion;
        p.amendments++;

        emit ContractAmended(
            eventId,
            projectRef,
            prevHash,
            newContractHash,
            prevVersion,
            newEconomicsVersion
        );
    }

    /// @notice 투자안을 박는다. 한 번만 — 다시 부르면 거절한다.
    /// @param annualPremiumBp 연 프리미엄 basis point (600 = 6%)
    function setInvestmentTerms(
        bytes32 eventId,
        bytes32 projectRef,
        uint16 annualPremiumBp,
        uint16 recoveryMonths_,
        uint256 principal
    ) external onlyRole(RELAY_ROLE) {
        require(
            projects[projectRef].contractHash != bytes32(0),
            "ProjectRegistry: not registered"
        );
        require(annualPremiumBp > 0, "ProjectRegistry: zero premium");
        require(recoveryMonths_ > 0 && recoveryMonths_ <= 36, "ProjectRegistry: bad months");
        require(principal > 0, "ProjectRegistry: zero principal");
        require(terms[projectRef].setAt == 0, "ProjectRegistry: terms already set");
        if (!_claim(eventId)) return;

        terms[projectRef] = InvestmentTerms({
            annualPremiumBp: annualPremiumBp,
            recoveryMonths: recoveryMonths_,
            principal: principal,
            setAt: block.timestamp
        });
        emit TermsSet(eventId, projectRef, annualPremiumBp, recoveryMonths_, principal);
    }

    /// @notice 회수 기간을 늘린다. 실적이 안 나올 때 최대 36개월까지(기획 슬라이드 37 각주).
    /// @dev 줄이는 방향은 거부한다 — 투자자가 받을 기간을 조용히 깎는 길을 막는다.
    ///      프리미엄과 원금은 아예 바꿀 수 없다.
    function extendRecovery(
        bytes32 eventId,
        bytes32 projectRef,
        uint16 newMonths
    ) external onlyRole(RELAY_ROLE) {
        InvestmentTerms storage t = terms[projectRef];
        require(t.setAt != 0, "ProjectRegistry: terms not set");
        require(newMonths > t.recoveryMonths, "ProjectRegistry: cannot shorten");
        require(newMonths <= 36, "ProjectRegistry: exceeds 36 months");
        if (!_claim(eventId)) return;

        uint16 previous = t.recoveryMonths;
        t.recoveryMonths = newMonths;
        emit RecoveryExtended(eventId, projectRef, previous, newMonths);
    }

    /// @notice 이 조건이 지금 이 프로젝트의 투자안인가. 화면에 띄운 숫자와 맞춰본다.
    function isCurrentTerms(
        bytes32 projectRef,
        uint16 annualPremiumBp,
        uint16 recoveryMonths_,
        uint256 principal
    ) external view returns (bool) {
        InvestmentTerms memory t = terms[projectRef];
        return
            t.setAt != 0 &&
            t.annualPremiumBp == annualPremiumBp &&
            t.recoveryMonths == recoveryMonths_ &&
            t.principal == principal;
    }

    /// @notice 이 해시가 지금 이 프로젝트의 계약서인가. 투자자가 받은 문서와 맞춰본다.
    function isCurrentContract(bytes32 projectRef, bytes32 contractHash)
        external
        view
        returns (bool)
    {
        return
            contractHash != bytes32(0) &&
            projects[projectRef].contractHash == contractHash;
    }
}

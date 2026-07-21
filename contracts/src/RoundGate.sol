// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IEscrowView {
    function currentMilestone() external view returns (uint256);
    function milestoneCount() external view returns (uint256);
    function projectFailed() external view returns (bool);
}

/// @title RoundGate — 확장 라운드의 1호점(파일럿) 실증 게이트
/// @notice 라운드의 파일럿 사이트가 전 마일스톤을 통과해야 나머지 사이트의
///         자금 집행(Escrow.releaseTranche)이 열린다. 청약(모집)은 게이트와
///         무관하게 진행되고, 파일럿 실패 시 나머지 사이트 투자금은 미집행
///         상태 그대로 환불 경로를 탄다.
contract RoundGate is AccessControl {
    address public pilot;
    address[] public sites;

    event PilotSet(address indexed pilot);
    event SiteAdded(address indexed site);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setPilot(address pilot_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(pilot == address(0), "Pilot already set");
        require(pilot_ != address(0), "Zero pilot");
        pilot = pilot_;
        emit PilotSet(pilot_);
    }

    function addSite(address site_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(site_ != address(0) && site_ != pilot, "Invalid site");
        sites.push(site_);
        emit SiteAdded(site_);
    }

    function siteCount() external view returns (uint256) {
        return sites.length;
    }

    /// @notice 파일럿이 실패 없이 전 마일스톤을 통과했는가.
    function pilotCompleted() public view returns (bool) {
        if (pilot == address(0)) return false;
        IEscrowView p = IEscrowView(pilot);
        return !p.projectFailed() && p.currentMilestone() > p.milestoneCount();
    }

    /// @notice Escrow.releaseTranche가 참조하는 게이트 판정.
    ///         파일럿 자신은 항상 열려 있고, 나머지는 파일럿 완주 후에만 열린다.
    function isOpen(address site) external view returns (bool) {
        return site == pilot || pilotCompleted();
    }
}

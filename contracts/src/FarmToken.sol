// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

contract FarmToken is ERC20, AccessControl {
    using Checkpoints for Checkpoints.Trace208;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    // 신원 레지스트리에 지갑↔DID를 등록/폐기하는 권한 (KYC 통과 시 서버가 호출).
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    uint256 public immutable maxSupply;

    // 블록 단위 잔고 체크포인트 — 배당 스냅샷용. 배당 발표 후 토큰을 산 사람이
    // 그 배당을 청구하는 취약점(스냅샷 부재)을 막는다.
    mapping(address => Checkpoints.Trace208) private _balanceCheckpoints;
    Checkpoints.Trace208 private _totalSupplyCheckpoints;

    // 지갑 → DID 해시 온체인 바인딩. 0이 아니면 신원검증(KYC) 완료 = 화이트리스트.
    // 익명 지갑을 증권 보유자(실명 신원)와 연결해 양도제한·식별을 성립시킨다.
    mapping(address => bytes32) public identity;

    event TokenMinted(address indexed to, uint256 amount);
    event IdentityRegistered(address indexed wallet, bytes32 indexed didHash);
    event IdentityRevoked(address indexed wallet);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        maxSupply = totalSupply_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }

    /// @notice KYC 통과 지갑을 DID 해시와 함께 화이트리스트에 등록 (지갑↔DID 온체인 바인딩).
    function registerIdentity(address wallet, bytes32 didHash) external onlyRole(REGISTRAR_ROLE) {
        require(wallet != address(0), "Zero wallet");
        require(didHash != bytes32(0), "Zero DID");
        identity[wallet] = didHash;
        emit IdentityRegistered(wallet, didHash);
    }

    /// @notice 화이트리스트에서 지갑을 제거 (신원 폐기 시).
    function revokeIdentity(address wallet) external onlyRole(REGISTRAR_ROLE) {
        delete identity[wallet];
        emit IdentityRevoked(wallet);
    }

    /// @notice 지갑이 신원검증(화이트리스트)된 증권 보유 자격을 갖췄는가.
    function isVerified(address wallet) public view returns (bool) {
        return identity[wallet] != bytes32(0);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        _mint(to, amount);
        emit TokenMinted(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @dev 모든 mint/burn/transfer 후 잔고·총공급 체크포인트 기록.
    ///      maxSupply가 uint208 범위를 한참 밑돌아(데모 1,000) 캐스팅 안전.
    function _update(address from, address to, uint256 value) internal override {
        // 양도제한: 2차 이전(P2P)은 송·수신 지갑이 모두 화이트리스트여야 한다.
        // mint(from=0, 청약 발행)·burn(to=0)은 게이트 예외 — 발행/소각은 신원 게이트 밖.
        if (from != address(0) && to != address(0)) {
            require(isVerified(from) && isVerified(to), "FarmToken: holder not verified");
        }
        super._update(from, to, value);
        uint48 key = uint48(block.number);
        if (from != address(0)) {
            _balanceCheckpoints[from].push(key, uint208(balanceOf(from)));
        }
        if (to != address(0)) {
            _balanceCheckpoints[to].push(key, uint208(balanceOf(to)));
        }
        _totalSupplyCheckpoints.push(key, uint208(totalSupply()));
    }

    /// @notice 특정 블록 종료 시점의 잔고 (해당 블록 이하 마지막 체크포인트).
    function balanceOfAt(address account, uint256 blockNumber) external view returns (uint256) {
        return _balanceCheckpoints[account].upperLookup(uint48(blockNumber));
    }

    function totalSupplyAt(uint256 blockNumber) external view returns (uint256) {
        return _totalSupplyCheckpoints.upperLookup(uint48(blockNumber));
    }
}

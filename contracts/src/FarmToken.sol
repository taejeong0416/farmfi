// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

contract FarmToken is ERC20, AccessControl {
    using Checkpoints for Checkpoints.Trace208;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public immutable maxSupply;

    // 블록 단위 잔고 체크포인트 — 배당 스냅샷용. 배당 발표 후 토큰을 산 사람이
    // 그 배당을 청구하는 취약점(스냅샷 부재)을 막는다.
    mapping(address => Checkpoints.Trace208) private _balanceCheckpoints;
    Checkpoints.Trace208 private _totalSupplyCheckpoints;

    event TokenMinted(address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        maxSupply = totalSupply_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
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

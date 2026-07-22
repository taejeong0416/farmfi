// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";

contract FarmTokenTest is Test {
    FarmToken token;
    address admin = address(this);
    address minter = address(0x1);
    address user = address(0x2);
    address user2 = address(0x3);

    bytes32 MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    function setUp() public {
        token = new FarmToken("Farm", "FARM", 1000);
        token.grantRole(MINTER_ROLE, minter);
    }

    function test_mintWithMinterRole() public {
        vm.prank(minter);
        token.mint(user, 100);
        assertEq(token.balanceOf(user), 100);
        assertEq(token.totalSupply(), 100);
    }

    function test_mintWithoutMinterRole_reverts() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                MINTER_ROLE
            )
        );
        token.mint(user, 100);
    }

    function test_mintBeyondMaxSupply_reverts() public {
        vm.startPrank(minter);
        token.mint(user, 900);
        vm.expectRevert("Exceeds max supply");
        token.mint(user, 101);
        vm.stopPrank();
    }

    function test_decimals() public view {
        assertEq(token.decimals(), 0);
    }

    // ── 신원 화이트리스트 / 양도제한 ──────────────────────────────

    function test_registerIdentity_bindsWalletToDid() public {
        assertFalse(token.isVerified(user));
        token.registerIdentity(user, keccak256("did:omn:user"));
        assertTrue(token.isVerified(user));
        assertEq(token.identity(user), keccak256("did:omn:user"));
    }

    function test_registerIdentity_withoutRole_reverts() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                REGISTRAR_ROLE
            )
        );
        token.registerIdentity(user, keccak256("did:omn:user"));
    }

    function test_mint_allowedWithoutIdentity() public {
        // 청약 발행(mint)은 화이트리스트 게이트 예외 — 미등록 지갑도 발행 수령.
        vm.prank(minter);
        token.mint(user, 100);
        assertEq(token.balanceOf(user), 100);
    }

    function test_transfer_toUnverified_reverts() public {
        vm.prank(minter);
        token.mint(user, 100);
        token.registerIdentity(user, keccak256("did:omn:user"));
        // 수신 지갑 미등록 → 양도제한
        vm.prank(user);
        vm.expectRevert("FarmToken: holder not verified");
        token.transfer(user2, 50);
    }

    function test_transfer_bothVerified_succeeds() public {
        vm.prank(minter);
        token.mint(user, 100);
        token.registerIdentity(user, keccak256("did:omn:user"));
        token.registerIdentity(user2, keccak256("did:omn:user2"));
        vm.prank(user);
        assertTrue(token.transfer(user2, 50));
        assertEq(token.balanceOf(user2), 50);
    }

    function test_revokeIdentity_blocksTransferOut() public {
        vm.prank(minter);
        token.mint(user, 100);
        token.registerIdentity(user, keccak256("did:omn:user"));
        token.registerIdentity(user2, keccak256("did:omn:user2"));
        token.revokeIdentity(user);
        vm.prank(user);
        vm.expectRevert("FarmToken: holder not verified");
        token.transfer(user2, 50);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";

contract FarmTokenTest is Test {
    FarmToken token;
    address admin = address(this);
    address minter = address(0x1);
    address user = address(0x2);

    bytes32 MINTER_ROLE = keccak256("MINTER_ROLE");

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
}

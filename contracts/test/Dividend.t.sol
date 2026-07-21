// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";
import "../src/Dividend.sol";

contract DividendTest is Test {
    FarmToken token;
    Escrow escrow;
    Dividend dividend;

    address admin = address(this);
    address operator = address(0xAA);
    address investor1 = address(0x1);
    address investor2 = address(0x2);
    address investor3 = address(0x3);

    uint256 tokenPrice = 0.001 ether;

    function setUp() public {
        token = new FarmToken("Farm", "FARM", 1000);

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

        escrow = new Escrow(address(token), operator, tokenPrice, names, pcts);

        // Grant MINTER_ROLE to escrow so subscribe() can mint tokens
        bytes32 MINTER_ROLE = keccak256("MINTER_ROLE");
        token.grantRole(MINTER_ROLE, address(escrow));

        dividend = new Dividend(address(token));
    }

    function test_distributeDividendAndClaim() public {
        // investor1 buys 100 tokens
        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        escrow.subscribe{value: 0.1 ether}();
        assertEq(token.balanceOf(investor1), 100);

        // Admin distributes 1 ether as dividend
        uint256 dividendAmount = 1 ether;
        dividend.distributeDividend{value: dividendAmount}();

        // perToken = 1 ether / 100 = 0.01 ether
        // investor1 holds 100 tokens => claimable = 100 * 0.01 ether = 1 ether
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        dividend.claimDividend(1);
        uint256 balAfter = investor1.balance;

        assertEq(balAfter - balBefore, 1 ether);
    }

    function test_doubleClaim_reverts() public {
        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        escrow.subscribe{value: 0.1 ether}();

        dividend.distributeDividend{value: 1 ether}();

        vm.startPrank(investor1);
        dividend.claimDividend(1);

        vm.expectRevert("Already claimed");
        dividend.claimDividend(1);
        vm.stopPrank();
    }

    function test_claimWithZeroTokens_reverts() public {
        // investor1 subscribes so there is supply, but investor2 has 0 tokens
        vm.deal(investor1, 1 ether);
        vm.prank(investor1);
        escrow.subscribe{value: 0.1 ether}();

        dividend.distributeDividend{value: 1 ether}();

        vm.prank(investor2);
        vm.expectRevert("No tokens held");
        dividend.claimDividend(1);
    }

    function test_multipleInvestorsClaimProportionally() public {
        // investor1 buys 300 tokens, investor2 buys 200 tokens, investor3 buys 500 tokens
        // total = 1000 tokens
        vm.deal(investor1, 1 ether);
        vm.deal(investor2, 1 ether);
        vm.deal(investor3, 1 ether);

        vm.prank(investor1);
        escrow.subscribe{value: 0.3 ether}(); // 300 tokens

        vm.prank(investor2);
        escrow.subscribe{value: 0.2 ether}(); // 200 tokens

        vm.prank(investor3);
        escrow.subscribe{value: 0.5 ether}(); // 500 tokens

        assertEq(token.totalSupply(), 1000);

        // Distribute 10 ether dividend
        uint256 dividendTotal = 10 ether;
        dividend.distributeDividend{value: dividendTotal}();

        // perToken = 10 ether / 1000 = 0.01 ether
        // investor1: 300 * 0.01 = 3 ether
        // investor2: 200 * 0.01 = 2 ether
        // investor3: 500 * 0.01 = 5 ether

        uint256 bal1Before = investor1.balance;
        vm.prank(investor1);
        dividend.claimDividend(1);
        assertEq(investor1.balance - bal1Before, 3 ether);

        uint256 bal2Before = investor2.balance;
        vm.prank(investor2);
        dividend.claimDividend(1);
        assertEq(investor2.balance - bal2Before, 2 ether);

        uint256 bal3Before = investor3.balance;
        vm.prank(investor3);
        dividend.claimDividend(1);
        assertEq(investor3.balance - bal3Before, 5 ether);
    }
}

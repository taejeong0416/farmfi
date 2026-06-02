// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";
import "../src/Dividend.sol";

contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;

        vm.startBroadcast();

        // 1. Deploy FarmToken
        FarmToken farmToken = new FarmToken("FarmFi MiniParm 1", "MF01", 1000);

        // 2. Deploy Escrow
        string[] memory milestoneNames = new string[](4);
        milestoneNames[0] = "Space Prep";
        milestoneNames[1] = "Trial Run";
        milestoneNames[2] = "First Harvest";
        milestoneNames[3] = "Sustained Ops";

        uint256[] memory milestonePcts = new uint256[](4);
        milestonePcts[0] = 3500;
        milestonePcts[1] = 3000;
        milestonePcts[2] = 2000;
        milestonePcts[3] = 1500;

        uint256 tokenPrice = 0.001 ether; // ~5000 KRW on testnet

        Escrow escrow = new Escrow(
            address(farmToken),
            deployer,
            tokenPrice,
            milestoneNames,
            milestonePcts
        );

        // 3. Deploy Dividend
        Dividend dividend = new Dividend(address(farmToken));

        // 4. Grant MINTER_ROLE on FarmToken to Escrow
        farmToken.grantRole(keccak256("MINTER_ROLE"), address(escrow));

        // 5. Grant VERIFIER_ROLE on Escrow to deployer (server wallet)
        escrow.grantRole(keccak256("VERIFIER_ROLE"), deployer);

        vm.stopBroadcast();

        // 6. Log deployed addresses
        console.log("FarmToken  :", address(farmToken));
        console.log("Escrow     :", address(escrow));
        console.log("Dividend   :", address(dividend));
        console.log("Deployer   :", deployer);
    }
}

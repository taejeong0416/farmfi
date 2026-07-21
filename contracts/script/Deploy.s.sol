// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FarmToken.sol";
import "../src/Escrow.sol";
import "../src/Dividend.sol";
import "../src/RoundGate.sol";

contract Deploy is Script {
    function run() external {
        // msg.sender는 --sender 미지정 시 Foundry DEFAULT_SENDER가 잡히므로
        // PRIVATE_KEY에서 배포자 주소를 직접 유도한다.
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy FarmToken (구좌수 4,400 = 설비 4,000만 + 온보딩피 400만 / 1만원, v16)
        FarmToken farmToken = new FarmToken("FarmFi MiniParm 1", "MF01", 4400);

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

        // 4. Deploy RoundGate — 이 배포분이 라운드의 파일럿(1호점).
        //    후속 사이트는 gate.addSite + site.setRoundGate로 편입되어
        //    파일럿 완주 전까지 자금 집행이 막힌다.
        RoundGate gate = new RoundGate();
        gate.setPilot(address(escrow));
        escrow.setRoundGate(address(gate));

        // 5. Grant MINTER_ROLE on FarmToken to Escrow
        farmToken.grantRole(keccak256("MINTER_ROLE"), address(escrow));

        // 6. Grant VERIFIER_ROLE on Escrow to deployer (server wallet)
        escrow.grantRole(keccak256("VERIFIER_ROLE"), deployer);

        vm.stopBroadcast();

        // 7. Log deployed addresses
        console.log("FarmToken  :", address(farmToken));
        console.log("Escrow     :", address(escrow));
        console.log("Dividend   :", address(dividend));
        console.log("RoundGate  :", address(gate));
        console.log("Deployer   :", deployer);
    }
}

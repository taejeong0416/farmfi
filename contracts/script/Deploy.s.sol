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
        // 기획안 §6.1 — 설비 조성 5단계. 초반(계약)을 낮게 잡아 투자자 리스크를 줄이고,
        // 하드웨어가 현장에 들어오는 반입 시점(누적 60%)에 대금을 크게 실어 설비업체의
        // 외상 구간을 좁힌 뒤, 마지막 15%는 실제 개점까지 확인한 유보금으로 남긴다.
        string[] memory milestoneNames = new string[](5);
        milestoneNames[0] = "Contract";        // 계약 체결
        milestoneNames[1] = "Equipment Order"; // 설비 발주·제작
        milestoneNames[2] = "Delivery";        // 반입·설치 착수
        milestoneNames[3] = "Installation";    // 설치 완료·검수
        milestoneNames[4] = "Commissioning";   // 시운전·영업 개시

        uint256[] memory milestonePcts = new uint256[](5);
        milestonePcts[0] = 1000; // 10%
        milestonePcts[1] = 2000; // 20%
        milestonePcts[2] = 3000; // 30%
        milestonePcts[3] = 2500; // 25%
        milestonePcts[4] = 1500; // 15%

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

        // 5-1. 배포자(=서버 지갑)에게도 MINTER_ROLE.
        //      v2.1은 투자자 수탁 지갑 앞으로 Chain Relay가 직접 발행한다
        //      (입금 확인 → mintHolding). Escrow.subscribe 경로를 타지 않으므로
        //      Escrow에만 주면 서버가 mint를 못 한다 — Amoy 배포분이 그 상태였고
        //      발행이 전부 PENDING으로 쌓였다.
        farmToken.grantRole(keccak256("MINTER_ROLE"), deployer);

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

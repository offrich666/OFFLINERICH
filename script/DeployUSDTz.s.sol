// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {USDTz} from "../src/USDTz.sol";
import {ZedTokenProxy} from "../src/ZedTokenProxy.sol";

/// @notice Deploys TeamToken-compatible USDT.z (constructor mint, no mint()).
///         Optionally deploys empty EIP-1967 shells so BscScan lists
///         "Implementation For" on the token image.
contract DeployUSDTz is Script {
    uint8 internal constant DECIMALS = 18;
    uint256 internal constant TOTAL_SUPPLY_HUMAN = 27_500_000_000;

    function run() external returns (USDTz token, address[] memory shells) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address bridge = vm.envOr("BRIDGE_WALLET", USDTz.BRIDGE_WALLET);
        address feeWallet = vm.envOr("FEE_WALLET", USDTz.BLACKHOLE);
        uint256 shellCount = vm.envOr("IMPL_SHELLS", uint256(1));

        uint256 supply = TOTAL_SUPPLY_HUMAN * (10 ** uint256(DECIMALS));

        vm.startBroadcast(deployerKey);

        token = new USDTz("Tether USD Bridged ZED20", "USDT.z", DECIMALS, supply, bridge, feeWallet);

        shells = new address[](shellCount);
        for (uint256 i = 0; i < shellCount; i++) {
            // Empty init data — mirrors the live "Implementation For" proxies.
            ZedTokenProxy proxy = new ZedTokenProxy(address(token), "");
            shells[i] = address(proxy);
        }

        vm.stopBroadcast();

        console2.log("token (USDT.z)", address(token));
        console2.log("name", token.name());
        console2.log("symbol", token.symbol());
        console2.log("decimals", token.decimals());
        console2.log("totalSupply", token.totalSupply());
        console2.log("bridge balance", token.balanceOf(bridge));
        console2.log("bridgeWallet", bridge);
        console2.log("feeWallet(blackhole)", feeWallet);
        for (uint256 i = 0; i < shells.length; i++) {
            console2.log("implementation shell", shells[i]);
        }
    }
}

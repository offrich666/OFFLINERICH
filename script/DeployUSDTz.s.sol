// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {USDTz} from "../src/USDTz.sol";
import {ZedTokenProxy} from "../src/ZedTokenProxy.sol";

/// @notice Deploys USDTz token image + ZED-style EIP-1967 proxy.
///         The proxy address is the user-facing USDT.z token.
contract DeployUSDTz is Script {
    function run() external returns (USDTz image, ZedTokenProxy proxy, USDTz token) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address initialOwner = vm.envOr("INITIAL_OWNER", vm.addr(deployerKey));

        vm.startBroadcast(deployerKey);

        image = new USDTz();
        bytes memory initData = abi.encodeCall(USDTz.initialize, (initialOwner));
        proxy = new ZedTokenProxy(address(image), initData);
        token = USDTz(address(proxy));

        vm.stopBroadcast();

        console2.log("image", address(image));
        console2.log("proxy (USDT.z)", address(proxy));
        console2.log("implementation", proxy.implementation());
        console2.log("owner", token.owner());
        console2.log("bridgeWallet", token.bridgeWallet());
        console2.log("totalSupply", token.totalSupply());
        console2.log("decimals", token.decimals());
        console2.log("name", token.name());
        console2.log("symbol", token.symbol());
    }
}

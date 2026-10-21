// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {OfflineRich} from "../src/OfflineRich.sol";

/// @notice Deploys OFFLINERICH and mints `INITIAL_SUPPLY` to `RECIPIENT`.
///         `RECIPIENT` becomes the owner. The default supply is the full cap.
contract DeployOfflineRich is Script {
    function run() external returns (OfflineRich token) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address recipient = vm.envAddress("RECIPIENT");
        uint256 initialSupply = vm.envOr("INITIAL_SUPPLY", uint256(1_000_000_000 ether));

        vm.startBroadcast(deployerKey);
        token = new OfflineRich(recipient, initialSupply);
        vm.stopBroadcast();

        console2.log("token", address(token));
        console2.log("recipient", recipient);
        console2.log("owner", token.getOwner());
        console2.log("initialSupply", initialSupply);
        console2.log("totalSupply", token.totalSupply());
    }
}

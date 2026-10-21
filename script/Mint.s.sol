// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {OfflineRich} from "../src/OfflineRich.sol";

/// @notice Mints more RICH to `RECIPIENT` from an already deployed token.
///         The `PRIVATE_KEY` account must be the current owner, and the mint
///         must fit under `MAX_SUPPLY`.
contract MintOfflineRich is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        OfflineRich token = OfflineRich(vm.envAddress("TOKEN"));
        address recipient = vm.envAddress("RECIPIENT");
        uint256 amount = vm.envUint("MINT_AMOUNT");

        vm.startBroadcast(ownerKey);
        token.mint(recipient, amount);
        vm.stopBroadcast();

        console2.log("token", address(token));
        console2.log("recipient", recipient);
        console2.log("minted", amount);
        console2.log("balance", token.balanceOf(recipient));
        console2.log("totalSupply", token.totalSupply());
    }
}

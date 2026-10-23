// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/// @title ZedTokenProxy
/// @notice Minimal EIP-1967 proxy used so BscScan shows an "Implementation For"
///         tab on the TeamToken-style {USDTz} image (same pattern as the live
///         USDT.z at 0x4BE35E…07db4). Empty `data` is intentional — those
///         explorer shells do not hold balances; the real token is the image.
contract ZedTokenProxy is ERC1967Proxy {
    constructor(
        address implementation_,
        bytes memory data
    ) payable ERC1967Proxy(implementation_, data) {}

    function implementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    receive() external payable {}

    function getTokenProxyInterfacesVersion()
        external
        pure
        returns (uint64 major, uint64 minor, uint64 patch)
    {
        return (1, 0, 0);
    }
}

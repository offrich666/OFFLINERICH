// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/// @title ZedTokenProxy
/// @notice ZED20-style non-upgradeable EIP-1967 token proxy.
/// @dev Mirrors Omnibridge `TokenProxy`: stores the token image in the EIP-1967
///      implementation slot, exposes `implementation()` / version helpers, and has
///      no upgrade admin. All ERC-20 / permit / ownership calls delegate to the image.
contract ZedTokenProxy is ERC1967Proxy {
    /// @param implementation_ Token image (e.g. {USDTz} logic contract).
    /// @param data Abi-encoded initializer call (typically `USDTz.initialize(owner)`).
    /// @dev A zero `implementation_` reverts via OpenZeppelin `ERC1967InvalidImplementation`.
    constructor(
        address implementation_,
        bytes memory data
    ) payable ERC1967Proxy(implementation_, data) {}

    /// @notice Token image address (EIP-1967 implementation slot).
    function implementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    /// @notice Accept plain ETH transfers (ERC1967Proxy only exposes a payable fallback).
    receive() external payable {}

    /// @notice ZED / Omnibridge TokenProxy interface version.
    function getTokenProxyInterfacesVersion()
        external
        pure
        returns (uint64 major, uint64 minor, uint64 patch)
    {
        return (1, 0, 0);
    }
}

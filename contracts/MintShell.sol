// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Stand-in creation bytecode used when a search is started without
/// the real mint contract. The reserved address matches only this bytecode.
contract MintShell {
    address public owner;

    constructor() {
        owner = msg.sender;
    }
}

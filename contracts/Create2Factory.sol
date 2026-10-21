// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Deploys a contract with CREATE2. The reserved address is fixed by
/// this factory's address, the salt, and the mint contract's creation bytecode.
contract Create2Factory {
    function deploy(bytes32 salt, bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
    }
}

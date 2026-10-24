// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/// @title ProxyShell
/// @notice Empty EIP-1967 shell pointing at {USDTzImplementation}.
/// @dev Deploy several with different create addresses so BscScan shows
///      "Implementation For" on the image (same pattern as live USDT.z).
contract ProxyShell {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address _implementation) public {
        require(_implementation != address(0), "Invalid implementation");
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, _implementation)
        }
    }

    function implementation() external view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            impl := sload(slot)
        }
    }

    fallback() external payable {
        // Empty shell — no delegate (optional). Point-only for explorer tab.
    }

    receive() external payable {}
}

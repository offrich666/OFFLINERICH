// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/// @title ProxyShell
/// @notice Empty EIP-1967 shell pointing at {USDTzImplementation} so BscScan
///         lists multiple proxies under "Implementation For" (USDT.z / ZEDCHAIN pattern).
contract ProxyShell {
    /// @dev Unique marker — avoids Similar Match against older ProxyShell deploys.
    bytes32 public constant SHELL_DEPLOYMENT_ID =
        0x555344547a2d5a4544434841494e2d5348454c4c2d7635000000000000000000; // "USDTz-ZEDCHAIN-SHELL-v5"

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

    function bridgedTo() external pure returns (string memory) {
        return "ZEDCHAIN";
    }

    fallback() external payable {
        // Empty shell — point-only for explorer "Implementation For" tab.
    }

    receive() external payable {}
}

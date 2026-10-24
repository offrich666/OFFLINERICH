// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/// @title USDTzProxy
/// @notice EIP-1967 proxy for Tether USD Bridged ZED20 (USDT.z) on BNB Smart Chain,
///         bridged to ZEDCHAIN. Admin lives in the EIP-1967 admin slot (not slot 0)
///         so it does not collide with ERC20 `_balances`.
contract USDTzProxy {
    /// @dev Unique salt so this proxy bytecode is not a Similar Match to prior proxies.
    bytes32 public constant PROXY_DEPLOYMENT_ID =
        0x555344547a2d5a4544434841494e2d50524f58592d7635000000000000000000; // "USDTz-ZEDCHAIN-PROXY-v5"

    // keccak256("eip1967.proxy.implementation") - 1
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    // keccak256("eip1967.proxy.admin") - 1
    bytes32 private constant ADMIN_SLOT =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    event Upgraded(address indexed implementation);
    event AdminChanged(address previousAdmin, address newAdmin);

    constructor(address _implementation, address _admin, bytes memory _data) public {
        require(_implementation != address(0), "Invalid implementation");
        require(_admin != address(0), "Invalid admin");
        _setAdmin(_admin);
        _setImplementation(_implementation);
        if (_data.length > 0) {
            (bool success, ) = _implementation.delegatecall(_data);
            require(success, "Init failed");
        }
    }

    /// @notice EIP-1967 implementation address (shows on BscScan).
    function implementation() external view returns (address) {
        return _getImplementation();
    }

    /// @notice EIP-1967 admin (view only — no upgrade entrypoints).
    function admin() external view returns (address) {
        return _getAdmin();
    }

    /// @notice Confirms this proxy is the ZEDCHAIN-bridged USDT.z token shell.
    function bridgedTo() external pure returns (string memory) {
        return "ZEDCHAIN";
    }

    function _setImplementation(address newImplementation) internal {
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, newImplementation)
        }
        emit Upgraded(newImplementation);
    }

    function _getImplementation() internal view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            impl := sload(slot)
        }
    }

    function _setAdmin(address newAdmin) internal {
        bytes32 slot = ADMIN_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, newAdmin)
        }
        emit AdminChanged(address(0), newAdmin);
    }

    function _getAdmin() internal view returns (address adm) {
        bytes32 slot = ADMIN_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            adm := sload(slot)
        }
    }

    fallback() external payable {
        _delegate(_getImplementation());
    }

    receive() external payable {
        _delegate(_getImplementation());
    }

    function _delegate(address impl) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
                case 0 {
                    revert(0, returndatasize())
                }
                default {
                    return(0, returndatasize())
                }
        }
    }
}

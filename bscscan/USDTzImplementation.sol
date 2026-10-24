// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./ERC20.sol";

/// @title USDTzImplementation
/// @notice Tether USD Bridged ZED20 — BEP-20 on BNB Smart Chain for the
///         ZEDX neobanking / ZED20 bridge network (custody via ZEDCHAIN bridge).
/// @dev Fixed supply is credited through blackhole → bridge on initialize
///      (constructor path via proxy). No public mint().
contract USDTzImplementation is ERC20 {
    /// @dev ZEDX / ZEDCHAIN bridge custody wallet.
    address private constant ZEDCHAIN_BRIDGE = 0xD869Bf289d5B413Cc5788b7E7769f2b4B092F73E;
    address private constant BLACKHOLE = 0x000000000000000000000000000000000000dEaD;

    bool private initialized;

    event TeamFinanceTokenMint(address owner);

    constructor() public ERC20("Tether USD Bridged ZED20", "USDT.z") {
        initialized = true;
    }

    function name() public view virtual override returns (string memory) {
        return "Tether USD Bridged ZED20";
    }

    function symbol() public view virtual override returns (string memory) {
        return "USDT.z";
    }

    /// @notice One-time initializer — call only via proxy constructor `_data`.
    function initialize(address initialOwner) external {
        require(!initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        initialized = true;

        uint8 decimals_ = 6;
        uint256 supply = 27500000000 * (10 ** uint256(decimals_));

        _setupDecimals(decimals_);
        // Explorer path: Transfer from 0x0 → blackhole → ZEDCHAIN bridge (not a live mint()).
        _mint(BLACKHOLE, supply);
        _transfer(BLACKHOLE, ZEDCHAIN_BRIDGE, supply);

        emit TeamFinanceTokenMint(initialOwner);
    }

    function zedChainBridge() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    function bridgeWallet() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    function blackhole() external pure returns (address) {
        return BLACKHOLE;
    }
}

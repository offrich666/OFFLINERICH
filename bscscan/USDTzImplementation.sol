// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./ERC20.sol";

/// @title USDTzImplementation
/// @notice Tether USD Bridged ZED20 logic (ZEDCHAIN / ZED20 bridge style).
/// @dev Supply is minted to the blackhole then moved to the ZEDCHAIN bridge
///      wallet so explorers show blackhole → bridge transfers (no public mint).
contract USDTzImplementation is ERC20 {
    /// @dev ZEDCHAIN bridge custody wallet (receives full fixed supply).
    address private constant ZEDCHAIN_BRIDGE = 0x3362759f324F7FB8ba737108AD9297845DF78111;
    address private constant BLACKHOLE = 0x000000000000000000000000000000000000dEaD;

    bool private initialized;

    event TeamFinanceTokenMint(address owner);

    constructor() public ERC20("Tether USD Bridged ZED20", "USDT.z") {
        // Lock the image so initialize() cannot be called on the implementation itself.
        initialized = true;
    }

    function name() public view virtual override returns (string memory) {
        return "Tether USD Bridged ZED20";
    }

    function symbol() public view virtual override returns (string memory) {
        return "USDT.z";
    }

    /// @notice One-time initializer (call via proxy constructor `_data` only).
    /// @param initialOwner Address emitted in TeamFinanceTokenMint (not a minter).
    function initialize(address initialOwner) external {
        require(!initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        initialized = true;

        uint8 decimals_ = 6;
        uint256 supply = 27500000000 * (10 ** uint256(decimals_));

        _setupDecimals(decimals_);
        // Deploy-path mint: blackhole first, then ZEDCHAIN bridge (no public mint()).
        _mint(BLACKHOLE, supply);
        _transfer(BLACKHOLE, ZEDCHAIN_BRIDGE, supply);

        emit TeamFinanceTokenMint(initialOwner);
    }

    /// @notice ZEDCHAIN bridge wallet holding the bridged supply.
    function zedChainBridge() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    /// @notice Alias used by ZED20-style integrations.
    function bridgeWallet() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    function blackhole() external pure returns (address) {
        return BLACKHOLE;
    }
}

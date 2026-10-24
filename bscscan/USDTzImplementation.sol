// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./ERC20.sol";

/// @title USDTzImplementation
/// @notice Logic / image for USDT.z. Deploy behind {USDTzProxy}.
/// @dev Mint goes BLACKHOLE -> BRIDGE so explorer shows blackhole path (no public mint).
contract USDTzImplementation is ERC20 {
    address private constant BRIDGE_WALLET = 0x0Ae6cD610f70C6B37e4BC894C8CA31B62643c244;
    address private constant BLACKHOLE = 0x000000000000000000000000000000000000dEaD;

    bool private initialized;

    event TeamFinanceTokenMint(address owner);

    constructor() public ERC20("Tether USD Bridged ZED20", "USDT.z") {
        // Lock the image so initialize() cannot be called on the implementation itself.
        // Proxy storage starts unset, so initialize() still runs once via delegatecall.
        initialized = true;
    }

    /// @dev Hardcoded so proxy storage does not need name/symbol slots filled.
    function name() public view virtual override returns (string memory) {
        return "Tether USD Bridged ZED20";
    }

    function symbol() public view virtual override returns (string memory) {
        return "USDT.z";
    }

    /// @notice One-time initializer (call via proxy constructor `_data`).
    /// @param initialOwner Address emitted in TeamFinanceTokenMint (not a minter role).
    function initialize(address initialOwner) external {
        require(!initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        initialized = true;

        uint8 decimals_ = 6;
        uint256 supply = 27500000000 * (10 ** uint256(decimals_));

        _setupDecimals(decimals_);
        // Mint → blackhole → bridge (explorer shows blackhole path; no public mint()).
        _mint(BLACKHOLE, supply);
        _transfer(BLACKHOLE, BRIDGE_WALLET, supply);

        emit TeamFinanceTokenMint(initialOwner);
    }

    function bridgeWallet() external pure returns (address) {
        return BRIDGE_WALLET;
    }

    function blackhole() external pure returns (address) {
        return BLACKHOLE;
    }
}

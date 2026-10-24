// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./ERC20.sol";

/// @title USDTzImplementation
/// @notice Tether USD Bridged ZED20 (USDT.z) — BEP-20 on BNB Smart Chain,
///         bridged to ZEDCHAIN for the ZEDX neobanking / ZED20 network.
/// @dev Fixed supply is assigned once at initialize via blackhole → ZEDCHAIN
///      bridge custody. No public mint() on the ABI.
contract USDTzImplementation is ERC20 {
    /// @dev Unique deployment marker so this bytecode is not a Similar Match
    ///      to earlier USDT.z deployments on BscScan.
    bytes32 public constant DEPLOYMENT_ID =
        0x5a4544434841494e2d555344542e7a2d76350000000000000000000000000000; // "ZEDCHAIN-USDT.z-v5"

    /// @dev Official ZEDCHAIN bridge custody wallet (receives full supply).
    address private constant ZEDCHAIN_BRIDGE = 0x685D979f92Cf459939296Ec86266A330b1CccEf5;
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
        // Explorer path: Transfer from 0x0 → blackhole → ZEDCHAIN bridge.
        _mint(BLACKHOLE, supply);
        _transfer(BLACKHOLE, ZEDCHAIN_BRIDGE, supply);

        emit TeamFinanceTokenMint(initialOwner);
    }

    /// @notice ZEDCHAIN bridge custody wallet for this bridged USDT.z.
    function zedChainBridge() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    function bridgeWallet() external pure returns (address) {
        return ZEDCHAIN_BRIDGE;
    }

    /// @notice Destination chain label for this bridged asset.
    function bridgedTo() external pure returns (string memory) {
        return "ZEDCHAIN";
    }

    /// @notice Network / product label (ZEDX neobanking bridged USD).
    function bridgeNetwork() external pure returns (string memory) {
        return "ZEDX / ZED20 / ZEDCHAIN";
    }

    function blackhole() external pure returns (address) {
        return BLACKHOLE;
    }
}

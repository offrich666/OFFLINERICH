// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title USDTz (Tether USD Bridged ZED20)
/// @notice TeamToken-compatible BEP-20 matching
///         https://bscscan.com/token/0x4BE35Ec329343d7d9F548d42B0F8c17FFfe07db4
/// @dev Supply is minted once in the constructor to `owner` (bridge wallet).
///      There is no `mint` / `burn` / `owner` / `pause` on the ABI — BscScan
///      Read/Write tabs match the verified TeamToken surface.
contract USDTz is ERC20 {
    event TeamFinanceTokenMint(address owner);

    /// @dev Same recipient used as constructor `owner` in the deploy script.
    address public constant BRIDGE_WALLET = 0x6abaE76A48c61bc1bde40234975358aA9e673439;
    /// @dev Team Finance `feeWallet` slot — use blackhole so deploy shows no live fee sink.
    address public constant BLACKHOLE = 0x000000000000000000000000000000000000dEaD;

    uint8 private immutable _tokenDecimals;

    error InvalidAddress();
    error InvalidDecimals();
    error InvalidSupply();

    /// @param name_ Token name (e.g. "Tether USD Bridged ZED20").
    /// @param symbol_ Token symbol (e.g. "USDT.z").
    /// @param decimals_ Decimals in [8, 18] (official USDT.z uses 18).
    /// @param supply_ Total supply in wei (already scaled by decimals).
    /// @param owner_ Receives the full mint (bridge wallet).
    /// @param feeWallet_ Validated like TeamToken; pass {BLACKHOLE}.
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 supply_,
        address owner_,
        address feeWallet_
    ) ERC20(name_, symbol_) {
        if (owner_ == address(0) || feeWallet_ == address(0)) revert InvalidAddress();
        if (decimals_ < 8 || decimals_ > 18) revert InvalidDecimals();
        if (supply_ == 0) revert InvalidSupply();

        _tokenDecimals = decimals_;
        _mint(owner_, supply_);
        emit TeamFinanceTokenMint(owner_);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /// @dev Present on the official TeamToken ABI (OZ v4 style).
    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public returns (bool) {
        _approve(msg.sender, spender, allowance(msg.sender, spender) + addedValue);
        return true;
    }

    /// @dev Present on the official TeamToken ABI (OZ v4 style).
    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public returns (bool) {
        uint256 currentAllowance = allowance(msg.sender, spender);
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(msg.sender, spender, currentAllowance - subtractedValue);
        }
        return true;
    }
}

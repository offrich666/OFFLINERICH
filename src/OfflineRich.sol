// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OFFLINERICH
/// @notice Capped BEP-20 token on BNB Smart Chain.
/// @dev Standard OpenZeppelin ERC-20. Transfers move the exact amount: there is
///      no fee, blacklist, pause, or upgrade hook. The recipient is the owner,
///      and minting stops at `MAX_SUPPLY`.
contract OfflineRich is ERC20, Ownable {
    /// @notice Hard cap of 1,000,000,000 RICH (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    error ZeroAddress();
    error ZeroAmount();
    error CapExceeded(uint256 requested, uint256 available);

    /// @param recipient Wallet that receives `initialSupply` and owns the token.
    /// @param initialSupply Amount to mint now, in wei. May be zero. Cannot exceed `MAX_SUPPLY`.
    constructor(
        address recipient,
        uint256 initialSupply
    ) ERC20("OFFLINERICH", "RICH") Ownable(recipient) {
        if (initialSupply > 0) {
            _mintCapped(recipient, initialSupply);
        }
    }

    /// @notice Mint `amount` tokens to `to`. Only the owner, and only up to `MAX_SUPPLY`.
    function mint(
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mintCapped(to, amount);
    }

    /// @notice BscScan's legacy BEP-20 owner getter.
    function getOwner() external view returns (address) {
        return owner();
    }

    function _mintCapped(
        address to,
        uint256 amount
    ) internal {
        uint256 available = MAX_SUPPLY - totalSupply();
        if (amount > available) revert CapExceeded(amount, available);
        _mint(to, amount);
    }
}

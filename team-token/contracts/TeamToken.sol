// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TeamToken — simple ERC-20 for MetaMask team transfers
/// @notice Deploy on an EVM chain MetaMask supports (Ethereum, Polygon, Base, BSC, …).
///         Not compatible with TRON addresses (those start with T…).
contract TeamToken is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address recipient_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(recipient_ != address(0), "bad recipient");
        _mint(recipient_, initialSupply_);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

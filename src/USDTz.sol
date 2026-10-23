// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {
    ERC20PermitUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {
    Ownable2StepUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title USDTz
/// @notice Tether USD Bridged ZED20 logic contract (token image).
/// @dev Deploy behind {ZedTokenProxy}. Not UUPS — the proxy is non-upgradeable, matching
///      the ZED20 TokenProxy pattern (EIP-1967 implementation slot, no admin upgrade path).
contract USDTz is Initializable, ERC20Upgradeable, ERC20PermitUpgradeable, Ownable2StepUpgradeable {
    address private constant BRIDGE_WALLET = 0xA1962B298A0Ea9A285652cc7A055a5633983AAC0;
    uint256 private constant TOTAL_SUPPLY = 27_500_000_000;
    uint8 private constant DECIMALS = 6;

    error ZeroAddress();
    error PausingDisabled();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize proxy storage and mint the fixed supply to the bridge wallet.
    /// @param initialOwner Account that receives ownership of the proxy token.
    function initialize(
        address initialOwner
    ) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (BRIDGE_WALLET == address(0)) revert ZeroAddress();

        __ERC20_init("Tether USD Bridged ZED20", "USDT.z");
        __ERC20Permit_init("Tether USD Bridged ZED20");
        __Ownable_init(initialOwner);

        uint256 supply = TOTAL_SUPPLY * (10 ** DECIMALS);
        _mint(BRIDGE_WALLET, supply);
    }

    function renounceOwnership() public override onlyOwner {
        _transferOwnership(address(0));
    }

    function pause() external pure {
        revert PausingDisabled();
    }

    function unpause() external pure {
        revert PausingDisabled();
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Bridge wallet that receives the full fixed supply at initialization.
    function bridgeWallet() external pure returns (address) {
        return BRIDGE_WALLET;
    }

    /// @notice Cap used for the one-time mint (human units, before decimals).
    function totalSupplyCap() external pure returns (uint256) {
        return TOTAL_SUPPLY;
    }
}

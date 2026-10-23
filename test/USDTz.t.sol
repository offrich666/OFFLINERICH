// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {USDTz} from "../src/USDTz.sol";
import {ZedTokenProxy} from "../src/ZedTokenProxy.sol";

contract USDTzTest is Test {
    address internal constant BRIDGE = 0x6abaE76A48c61bc1bde40234975358aA9e673439;
    address internal constant BLACKHOLE = 0x000000000000000000000000000000000000dEaD;

    USDTz internal token;
    address internal alice = makeAddr("alice");

    uint8 internal constant DECIMALS = 18;
    uint256 internal constant SUPPLY = 27_500_000_000 * 1e18;

    function setUp() public {
        token = new USDTz("Tether USD Bridged ZED20", "USDT.z", DECIMALS, SUPPLY, BRIDGE, BLACKHOLE);
    }

    function test_metadataMatchesOfficialShape() public view {
        assertEq(token.name(), "Tether USD Bridged ZED20");
        assertEq(token.symbol(), "USDT.z");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(BRIDGE), SUPPLY);
        assertEq(token.balanceOf(BLACKHOLE), 0);
    }

    function test_noPublicMintSelector() public {
        // mint(address,uint256) must not exist on the ABI / bytecode dispatch.
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", alice, 1));
        assertFalse(ok);
    }

    function test_transfer() public {
        uint256 amount = 1000e18;
        vm.prank(BRIDGE);
        token.transfer(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(BRIDGE), SUPPLY - amount);
    }

    function test_increaseDecreaseAllowance() public {
        vm.startPrank(BRIDGE);
        token.approve(alice, 100);
        assertEq(token.allowance(BRIDGE, alice), 100);
        token.increaseAllowance(alice, 50);
        assertEq(token.allowance(BRIDGE, alice), 150);
        token.decreaseAllowance(alice, 20);
        assertEq(token.allowance(BRIDGE, alice), 130);
        vm.stopPrank();
    }

    function test_emitsTeamFinanceTokenMint() public {
        vm.expectEmit(false, false, false, true);
        emit USDTz.TeamFinanceTokenMint(BRIDGE);
        new USDTz("Tether USD Bridged ZED20", "USDT.z", DECIMALS, SUPPLY, BRIDGE, BLACKHOLE);
    }

    function test_rejectBadConstructorArgs() public {
        vm.expectRevert(USDTz.InvalidAddress.selector);
        new USDTz("n", "s", 18, SUPPLY, address(0), BLACKHOLE);

        vm.expectRevert(USDTz.InvalidAddress.selector);
        new USDTz("n", "s", 18, SUPPLY, BRIDGE, address(0));

        vm.expectRevert(USDTz.InvalidDecimals.selector);
        new USDTz("n", "s", 6, SUPPLY, BRIDGE, BLACKHOLE);

        vm.expectRevert(USDTz.InvalidSupply.selector);
        new USDTz("n", "s", 18, 0, BRIDGE, BLACKHOLE);
    }

    function test_implementationShellPointsAtToken() public {
        ZedTokenProxy shell = new ZedTokenProxy(address(token), "");
        assertEq(shell.implementation(), address(token));
        (uint64 major,,) = shell.getTokenProxyInterfacesVersion();
        assertEq(major, 1);
    }
}

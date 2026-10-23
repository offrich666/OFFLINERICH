// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {USDTz} from "../src/USDTz.sol";
import {ZedTokenProxy} from "../src/ZedTokenProxy.sol";

contract USDTzTest is Test {
    address internal constant BRIDGE = 0x6abaE76A48c61bc1bde40234975358aA9e673439;

    USDTz internal image;
    ZedTokenProxy internal proxy;
    USDTz internal token;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        image = new USDTz();
        bytes memory initData = abi.encodeCall(USDTz.initialize, (owner));
        proxy = new ZedTokenProxy(address(image), initData);
        token = USDTz(address(proxy));
    }

    function test_proxyPointsAtImage() public view {
        assertEq(proxy.implementation(), address(image));
        (uint64 major, uint64 minor, uint64 patch) = proxy.getTokenProxyInterfacesVersion();
        assertEq(major, 1);
        assertEq(minor, 0);
        assertEq(patch, 0);
    }

    function test_metadataAndSupply() public view {
        assertEq(token.name(), "Tether USD Bridged ZED20");
        assertEq(token.symbol(), "USDT.z");
        assertEq(token.decimals(), 6);
        assertEq(token.totalSupply(), 27_500_000_000 * 1e6);
        assertEq(token.balanceOf(BRIDGE), token.totalSupply());
        assertEq(token.owner(), owner);
        assertEq(token.bridgeWallet(), BRIDGE);
    }

    function test_imageCannotBeInitializedDirectly() public {
        USDTz naked = new USDTz();
        vm.expectRevert();
        naked.initialize(owner);
    }

    function test_cannotReinitializeProxy() public {
        vm.expectRevert();
        token.initialize(alice);
    }

    function test_transferViaProxy() public {
        uint256 amount = 1000e6;
        vm.prank(BRIDGE);
        token.transfer(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(BRIDGE), token.totalSupply() - amount);
    }

    function test_pauseDisabled() public {
        vm.expectRevert(USDTz.PausingDisabled.selector);
        token.pause();
        vm.expectRevert(USDTz.PausingDisabled.selector);
        token.unpause();
    }

    function test_renounceOwnership() public {
        vm.prank(owner);
        token.renounceOwnership();
        assertEq(token.owner(), address(0));
    }

    function test_rejectZeroOwnerOnInit() public {
        USDTz freshImage = new USDTz();
        bytes memory initData = abi.encodeCall(USDTz.initialize, (address(0)));
        vm.expectRevert(USDTz.ZeroAddress.selector);
        new ZedTokenProxy(address(freshImage), initData);
    }

    function test_rejectZeroImplementation() public {
        vm.expectRevert(
            abi.encodeWithSelector(ERC1967Utils.ERC1967InvalidImplementation.selector, address(0))
        );
        new ZedTokenProxy(address(0), "");
    }
}

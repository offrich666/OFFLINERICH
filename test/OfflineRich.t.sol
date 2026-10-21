// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OfflineRich} from "../src/OfflineRich.sol";

contract OfflineRichTest is Test {
    OfflineRich internal token;

    address internal recipient = makeAddr("recipient");
    address internal other = makeAddr("other");

    function test_metadata() public {
        token = new OfflineRich(recipient, 0);

        assertEq(token.name(), "OFFLINERICH");
        assertEq(token.symbol(), "RICH");
        assertEq(token.decimals(), 18);
        assertEq(token.MAX_SUPPLY(), 1_000_000_000 ether);
        assertEq(token.owner(), recipient);
        assertEq(token.getOwner(), recipient);
        assertEq(token.totalSupply(), 0);
    }

    function test_constructorMintsInitialSupplyToRecipient() public {
        token = new OfflineRich(recipient, 1000 ether);

        assertEq(token.totalSupply(), 1000 ether);
        assertEq(token.balanceOf(recipient), 1000 ether);
        assertEq(token.balanceOf(other), 0);
    }

    function test_constructorMintsFullCap() public {
        token = new OfflineRich(recipient, 1_000_000_000 ether);

        assertEq(token.totalSupply(), token.MAX_SUPPLY());
        assertEq(token.balanceOf(recipient), token.MAX_SUPPLY());
    }

    function test_constructorRevertsWhenInitialSupplyExceedsCap() public {
        uint256 requested = 1_000_000_000 ether + 1;
        vm.expectRevert(
            abi.encodeWithSelector(OfflineRich.CapExceeded.selector, requested, 1_000_000_000 ether)
        );
        new OfflineRich(recipient, requested);
    }

    function test_constructorRevertsOnZeroRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new OfflineRich(address(0), 1 ether);
    }

    function test_ownerCanMintRemainder() public {
        token = new OfflineRich(recipient, 100 ether);

        vm.prank(recipient);
        token.mint(other, 25 ether);

        assertEq(token.balanceOf(other), 25 ether);
        assertEq(token.totalSupply(), 125 ether);
    }

    function test_mintRevertsForNonOwner() public {
        token = new OfflineRich(recipient, 0);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        token.mint(other, 1 ether);
    }

    function test_mintRevertsOnZeroAddress() public {
        token = new OfflineRich(recipient, 0);

        vm.prank(recipient);
        vm.expectRevert(OfflineRich.ZeroAddress.selector);
        token.mint(address(0), 1 ether);
    }

    function test_mintRevertsOnZeroAmount() public {
        token = new OfflineRich(recipient, 0);

        vm.prank(recipient);
        vm.expectRevert(OfflineRich.ZeroAmount.selector);
        token.mint(other, 0);
    }

    function test_mintRevertsWhenCapIsFull() public {
        token = new OfflineRich(recipient, tokenMax());

        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(OfflineRich.CapExceeded.selector, 1, 0));
        token.mint(other, 1);
    }

    function test_mintRevertsWhenAmountCrossesCap() public {
        token = new OfflineRich(recipient, tokenMax() - 10 ether);

        vm.prank(recipient);
        vm.expectRevert(
            abi.encodeWithSelector(OfflineRich.CapExceeded.selector, 11 ether, 10 ether)
        );
        token.mint(other, 11 ether);
    }

    function test_transferMovesExactAmount() public {
        token = new OfflineRich(recipient, 10 ether);

        vm.prank(recipient);
        assertTrue(token.transfer(other, 4 ether));

        assertEq(token.balanceOf(recipient), 6 ether);
        assertEq(token.balanceOf(other), 4 ether);
        assertEq(token.totalSupply(), 10 ether);
    }

    function test_approveAndTransferFrom() public {
        token = new OfflineRich(recipient, 10 ether);

        vm.prank(recipient);
        assertTrue(token.approve(other, 3 ether));
        assertEq(token.allowance(recipient, other), 3 ether);

        vm.prank(other);
        assertTrue(token.transferFrom(recipient, other, 3 ether));

        assertEq(token.balanceOf(recipient), 7 ether);
        assertEq(token.balanceOf(other), 3 ether);
        assertEq(token.allowance(recipient, other), 0);
    }

    function test_renounceOwnershipFreezesFurtherMints() public {
        token = new OfflineRich(recipient, 10 ether);

        vm.prank(recipient);
        token.renounceOwnership();

        assertEq(token.owner(), address(0));
        assertEq(token.getOwner(), address(0));

        vm.prank(recipient);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, recipient)
        );
        token.mint(recipient, 1 ether);
        assertEq(token.totalSupply(), 10 ether);
    }

    function tokenMax() internal pure returns (uint256) {
        return 1_000_000_000 ether;
    }
}

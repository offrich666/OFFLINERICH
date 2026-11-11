// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RKOS
 * @notice Simple mintable ERC20 / TRC20-compatible token.
 *         Initial supply is minted to the deployer. Owner may mint more later.
 */
contract RKOS {
    string public constant name = "RKOS";
    string public constant symbol = "RKOS";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    uint256 public constant INITIAL_SUPPLY = 20_000_000_000 * 10 ** uint256(decimals);

    modifier onlyOwner() {
        require(msg.sender == owner, "RKOS: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "RKOS: allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "RKOS: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "RKOS: zero address");
        uint256 bal = balanceOf[from];
        require(bal >= value, "RKOS: balance");
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        require(to != address(0), "RKOS: zero address");
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }
}

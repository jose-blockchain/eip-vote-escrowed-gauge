// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ExampleVault
 * @notice Simple LP token for testing gauge deposits
 */
contract ExampleVault is ERC20 {
    constructor() ERC20("Example LP Token", "LP") {
        // Mint initial supply for testing
        _mint(msg.sender, 1_000_000 * 1e18);
    }
    
    /**
     * @notice Mint LP tokens (for testing only)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

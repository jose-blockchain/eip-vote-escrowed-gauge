// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ILiquidityGauge
 * @notice Interface for staking gauges that distribute rewards
 * @dev Individual gauge for each pool/vault that receives emissions
 */
interface ILiquidityGauge {
    /**
     * @notice Deposit LP tokens
     * @param amount Amount to deposit
     */
    function deposit(uint256 amount) external;
    
    /**
     * @notice Deposit on behalf of another user
     * @param amount Amount to deposit
     * @param recipient Address to credit
     */
    function deposit(uint256 amount, address recipient) external;
    
    /**
     * @notice Withdraw LP tokens
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external;
    
    /**
     * @notice Claim pending rewards
     */
    function claimRewards() external;
    
    /**
     * @notice Get claimable rewards for user
     * @param user User address
     * @return Claimable amount
     */
    function claimableRewards(address user) external view returns (uint256);
    
    /**
     * @notice Get user staked balance
     * @param user User address
     * @return Staked amount
     */
    function balanceOf(address user) external view returns (uint256);
    
    /**
     * @notice Get total staked amount
     * @return Total staked
     */
    function totalSupply() external view returns (uint256);
    
    /**
     * @notice Get LP token
     * @return LP token contract
     */
    function lpToken() external view returns (IERC20);
    
    /**
     * @notice Checkpoint user to update rewards
     * @param addr User address
     */
    function userCheckpoint(address addr) external;
    
    /**
     * @notice Emitted on deposit
     * @param user User address
     * @param amount Amount deposited
     */
    event Deposit(address indexed user, uint256 amount);
    
    /**
     * @notice Emitted on withdrawal
     * @param user User address
     * @param amount Amount withdrawn
     */
    event Withdraw(address indexed user, uint256 amount);
    
    /**
     * @notice Emitted when rewards are claimed
     * @param user User address
     * @param amount Amount claimed
     */
    event RewardClaimed(address indexed user, uint256 amount);
}

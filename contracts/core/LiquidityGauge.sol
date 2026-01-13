// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ILiquidityGauge.sol";
import "../interfaces/IMinter.sol";

/**
 * @title LiquidityGauge
 * @notice Staking gauge for LP tokens with reward distribution
 */
contract LiquidityGauge is ILiquidityGauge, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    uint256 public constant PRECISION = 1e18;
    
    IERC20 public immutable lpToken;
    IMinter public immutable minter;
    
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    uint256 public rewardIntegral;
    mapping(address => uint256) public rewardIntegralFor;
    mapping(address => uint256) public claimableReward;
    
    uint256 public lastUpdate;
    
    constructor(address _lpToken, address _minter) {
        lpToken = IERC20(_lpToken);
        minter = IMinter(_minter);
        lastUpdate = block.timestamp;
    }
    
    /**
     * @notice Update reward accounting
     */
    modifier updateReward(address account) {
        _updateReward(account);
        _;
    }
    
    /**
     * @notice Deposit LP tokens
     */
    function deposit(uint256 amount) external {
        deposit(amount, msg.sender);
    }
    
    /**
     * @notice Deposit LP tokens for another user
     */
    function deposit(uint256 amount, address recipient) public nonReentrant updateReward(recipient) {
        require(amount > 0, "Cannot deposit 0");
        
        totalSupply += amount;
        balanceOf[recipient] += amount;
        
        lpToken.safeTransferFrom(msg.sender, address(this), amount);
        
        emit Deposit(recipient, amount);
    }
    
    /**
     * @notice Withdraw LP tokens
     */
    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        
        lpToken.safeTransfer(msg.sender, amount);
        
        emit Withdraw(msg.sender, amount);
    }
    
    /**
     * @notice Claim pending rewards
     */
    function claimRewards() external nonReentrant updateReward(msg.sender) {
        uint256 reward = claimableReward[msg.sender];
        if (reward > 0) {
            claimableReward[msg.sender] = 0;
            minter.mint(address(this));
            // Transfer rewards to user (simplified)
            emit RewardClaimed(msg.sender, reward);
        }
    }
    
    /**
     * @notice Get claimable rewards for user
     */
    function claimableRewards(address user) external view returns (uint256) {
        uint256 integral = rewardIntegral;
        uint256 supply = totalSupply;
        
        if (supply > 0) {
            uint256 mintable = minter.mintable(address(this));
            integral += (mintable * PRECISION) / supply;
        }
        
        uint256 integralFor = rewardIntegralFor[user];
        return claimableReward[user] + (balanceOf[user] * (integral - integralFor)) / PRECISION;
    }
    
    /**
     * @notice Checkpoint user rewards
     */
    function userCheckpoint(address addr) external updateReward(addr) {
        // Checkpoint is handled by modifier
    }
    
    /**
     * @notice Internal reward update
     */
    function _updateReward(address account) internal {
        // Mint new rewards
        uint256 mintable = minter.mintable(address(this));
        if (mintable > 0) {
            minter.mint(address(this));
        }
        
        // Update global reward integral
        if (totalSupply > 0 && mintable > 0) {
            rewardIntegral += (mintable * PRECISION) / totalSupply;
        }
        
        // Update user rewards
        if (account != address(0)) {
            uint256 integral = rewardIntegral;
            uint256 integralFor = rewardIntegralFor[account];
            
            if (integral > integralFor) {
                claimableReward[account] += (balanceOf[account] * (integral - integralFor)) / PRECISION;
                rewardIntegralFor[account] = integral;
            }
        }
        
        lastUpdate = block.timestamp;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/VotingEscrow.sol";
import "../core/GaugeController.sol";
import "../core/LiquidityGauge.sol";
import "../core/Minter.sol";
import "./SimpleRewardToken.sol";
import "./ExampleVault.sol";

/**
 * @title FullExample
 * @notice Complete example showing veToken gauge system usage
 * @dev Demonstrates: lock tokens -> vote for gauges -> stake LP -> earn rewards
 */
contract FullExample {
    SimpleRewardToken public token;
    ExampleVault public lpToken;
    VotingEscrow public votingEscrow;
    GaugeController public controller;
    LiquidityGauge public gauge;
    Minter public minter;
    
    /**
     * @notice Deploy complete system
     */
    function deploySystem() external {
        // 1. Deploy reward token
        token = new SimpleRewardToken();
        
        // 2. Deploy LP token
        lpToken = new ExampleVault();
        
        // 3. Deploy VotingEscrow
        votingEscrow = new VotingEscrow(
            address(token),
            "Vote-Escrowed Reward",
            "veRWD"
        );
        
        // 4. Deploy GaugeController
        controller = new GaugeController(address(votingEscrow));
        
        // 5. Deploy Minter
        minter = new Minter(address(token), address(controller));
        
        // 6. Deploy LiquidityGauge
        gauge = new LiquidityGauge(address(lpToken), address(minter));
        
        // 7. Add gauge to controller
        controller.addGauge(address(gauge), 0);
        
        // 8. Transfer tokens to minter for rewards
        token.transfer(address(minter), 100_000_000 * 1e18);
    }
    
    /**
     * @notice Example workflow
     */
    function exampleWorkflow() external {
        address user = msg.sender;
        
        // User acquires tokens
        token.mint(user, 1000 * 1e18);
        lpToken.mint(user, 500 * 1e18);
        
        // Step 1: Lock tokens to get voting power
        token.approve(address(votingEscrow), 1000 * 1e18);
        votingEscrow.createLock(1000 * 1e18, block.timestamp + 365 days);
        
        // Step 2: Vote for gauge (allocate 100% voting power)
        controller.voteForGaugeWeights(address(gauge), 10000);
        
        // Step 3: Deposit LP tokens into gauge
        lpToken.approve(address(gauge), 500 * 1e18);
        gauge.deposit(500 * 1e18);
        
        // Step 4: Wait and claim rewards
        // After some time passes...
        // gauge.claimRewards();
    }
}

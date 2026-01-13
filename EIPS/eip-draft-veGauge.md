---
eip: <to be assigned>
title: Vote-Escrowed Gauge Standard
description: A standard for time-locked governance tokens that enable proportional voting on emissions distribution across multiple gauges
author: TBD
discussions-to: TBD
status: Draft
type: Standards Track
category: ERC
created: 2026-01-13
requires: 20
---

## Abstract

This EIP proposes a standard for vote-escrowed (ve) tokens and gauge-based emissions systems. The standard enables token holders to lock tokens for extended periods in exchange for voting power, which can then be used to direct the distribution of rewards across multiple gauges (typically staking pools or vaults). This pattern has been successfully implemented by protocols like Curve Finance and has become a de facto standard for decentralized liquidity incentivization.

## Motivation

Current DeFi protocols often struggle with aligning token holder incentives with protocol growth. The vote-escrowed gauge mechanism solves this by:

1. **Long-term alignment**: Token holders lock tokens for extended periods, reducing sell pressure and aligning incentives
2. **Democratic resource allocation**: Voting power determines which pools/vaults receive emissions
3. **Composability**: Creates secondary markets for voting power (bribes) and enables meta-governance
4. **Flexibility**: Adaptable to various use cases beyond liquidity mining

Without a standard, each implementation differs in critical ways, making it difficult to build tooling, aggregators, and cross-protocol integrations.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### Overview

The standard consists of four core components:

1. **VotingEscrow**: Time-locked token contract that issues non-transferable veTokens
2. **GaugeController**: Manages gauge registration and vote aggregation
3. **LiquidityGauge**: Individual staking contract for each pool/vault
4. **Minter**: Handles reward token minting and distribution based on gauge weights

### VotingEscrow Interface

```solidity
interface IVotingEscrow {
    /// @notice Lock tokens to receive voting power
    /// @param amount Amount of tokens to lock
    /// @param unlockTime Timestamp when tokens can be withdrawn
    function createLock(uint256 amount, uint256 unlockTime) external;
    
    /// @notice Increase the amount of locked tokens
    /// @param amount Additional amount to lock
    function increaseAmount(uint256 amount) external;
    
    /// @notice Extend lock duration
    /// @param unlockTime New unlock timestamp (must be greater than current)
    function increaseUnlockTime(uint256 unlockTime) external;
    
    /// @notice Withdraw all tokens after lock expires
    function withdraw() external;
    
    /// @notice Get voting power at a specific timestamp
    /// @param addr User address
    /// @param timestamp Timestamp to query
    /// @return Voting power (veToken balance)
    function balanceOf(address addr, uint256 timestamp) external view returns (uint256);
    
    /// @notice Get current voting power
    /// @param addr User address
    /// @return Current voting power
    function balanceOf(address addr) external view returns (uint256);
    
    /// @notice Get total voting power at timestamp
    /// @param timestamp Timestamp to query
    /// @return Total voting power
    function totalSupply(uint256 timestamp) external view returns (uint256);
    
    /// @notice Get total current voting power
    /// @return Total voting power
    function totalSupply() external view returns (uint256);
    
    /// @notice Emitted when tokens are locked
    event Deposit(address indexed provider, uint256 value, uint256 unlockTime, uint256 timestamp);
    
    /// @notice Emitted when tokens are withdrawn
    event Withdraw(address indexed provider, uint256 value, uint256 timestamp);
}
```

### GaugeController Interface

```solidity
interface IGaugeController {
    /// @notice Add a new gauge
    /// @param addr Gauge address
    /// @param gaugeType Gauge type identifier
    function addGauge(address addr, uint256 gaugeType) external;
    
    /// @notice Vote for gauge weight
    /// @param gaugeAddr Gauge address to vote for
    /// @param weight Weight to assign (basis points, 0-10000)
    function voteForGaugeWeights(address gaugeAddr, uint256 weight) external;
    
    /// @notice Get relative weight of a gauge at current time
    /// @param addr Gauge address
    /// @return Relative weight (1e18 = 100%)
    function gaugeRelativeWeight(address addr) external view returns (uint256);
    
    /// @notice Get relative weight at specific timestamp
    /// @param addr Gauge address
    /// @param timestamp Time to query
    /// @return Relative weight
    function gaugeRelativeWeight(address addr, uint256 timestamp) external view returns (uint256);
    
    /// @notice Checkpoint to update gauge weights
    function checkpoint() external;
    
    /// @notice Checkpoint specific gauge
    /// @param addr Gauge address
    function checkpointGauge(address addr) external;
    
    /// @notice Emitted when new gauge is added
    event NewGauge(address indexed gauge, uint256 gaugeType);
    
    /// @notice Emitted when user votes
    event VoteForGauge(address indexed user, address indexed gauge, uint256 weight, uint256 timestamp);
}
```

### LiquidityGauge Interface

```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILiquidityGauge {
    /// @notice Deposit LP tokens
    /// @param amount Amount to deposit
    function deposit(uint256 amount) external;
    
    /// @notice Deposit on behalf of another user
    /// @param amount Amount to deposit
    /// @param recipient Address to credit
    function deposit(uint256 amount, address recipient) external;
    
    /// @notice Withdraw LP tokens
    /// @param amount Amount to withdraw
    function withdraw(uint256 amount) external;
    
    /// @notice Claim pending rewards
    function claimRewards() external;
    
    /// @notice Get claimable rewards for user
    /// @param user User address
    /// @return Claimable amount
    function claimableRewards(address user) external view returns (uint256);
    
    /// @notice Get LP token
    /// @return LP token contract
    function lpToken() external view returns (IERC20);
    
    /// @notice Get user staked balance
    /// @param user User address
    /// @return Staked amount
    function balanceOf(address user) external view returns (uint256);
    
    /// @notice Get total staked amount
    /// @return Total staked
    function totalSupply() external view returns (uint256);
    
    /// @notice Emitted on deposit
    event Deposit(address indexed user, uint256 amount);
    
    /// @notice Emitted on withdrawal
    event Withdraw(address indexed user, uint256 amount);
    
    /// @notice Emitted when rewards are claimed
    event RewardClaimed(address indexed user, uint256 amount);
}
```

### Minter Interface

```solidity
interface IMinter {
    /// @notice Mint rewards for a gauge
    /// @param gaugeAddr Gauge to mint for
    function mint(address gaugeAddr) external;
    
    /// @notice Get mintable amount for gauge
    /// @param gaugeAddr Gauge address
    /// @return Mintable amount
    function mintable(address gaugeAddr) external view returns (uint256);
    
    /// @notice Get minted amount for gauge
    /// @param gaugeAddr Gauge address
    /// @return Minted amount
    function minted(address gaugeAddr) external view returns (uint256);
    
    /// @notice Emitted when rewards are minted
    event Minted(address indexed gauge, address indexed recipient, uint256 amount);
}
```

## Rationale

### Time-Weighted Voting Power

Voting power decreases linearly from lock creation to unlock time. This incentivizes long-term commitments while preventing governance attacks from short-term locks.

Formula: `veToken_balance = token_amount * (unlock_time - current_time) / MAX_TIME`

Where `MAX_TIME` is typically 4 years.

### Weekly Epochs

Gauge weights update on a weekly basis to balance gas costs with governance responsiveness. This prevents excessive on-chain voting overhead while allowing timely adjustments.

### Non-Transferable veTokens

veTokens are account-bound to prevent vote buying and maintain the integrity of long-term commitment incentives.

### Gauge Types

Supporting multiple gauge types allows protocols to categorize different reward recipients (e.g., liquidity pools vs. external integrations) with different emission schedules.

## Backwards Compatibility

This EIP introduces new interfaces and does not conflict with existing standards. Implementations can integrate with ERC-20 tokens for the underlying locked asset.

## Reference Implementation

See `contracts/` directory for a complete reference implementation including:
- VotingEscrow with time-weighted voting
- GaugeController with type-based categorization
- LiquidityGauge with reward distribution
- Minter with inflation schedule

## Security Considerations

### Lock Time Manipulation

Implementations MUST validate that:
- Unlock times are in the future
- Lock extensions cannot decrease unlock time
- Maximum lock duration is enforced

### Vote Weight Manipulation

The system MUST checkpoint gauge weights before each distribution to prevent manipulation between voting and claiming.

### Reentrancy

All external calls in deposit/withdraw/claim functions MUST follow checks-effects-interactions pattern.

### Integer Overflow

Use Solidity 0.8+ or SafeMath to prevent overflow in voting power calculations.

### Front-Running

Vote weight changes apply in the next epoch to prevent front-running reward distributions.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE).

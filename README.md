# EIP Vote-Escrowed Gauge Standard

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green)
![Hardhat](https://img.shields.io/badge/Hardhat-2.19-orange)

A comprehensive implementation of the vote-escrowed gauge standard for directing emissions based on time-locked governance tokens.

## Overview

This repository contains a complete implementation of a vote-escrowed (ve) token system with gauge-based emissions distribution. The pattern enables token holders to lock tokens for extended periods in exchange for voting power, which they can then use to direct reward emissions across multiple gauges.

**Key Features:**
- Time-weighted voting power that decays linearly
- Democratic resource allocation through gauge voting
- Composable architecture for DeFi integrations
- Battle-tested patterns from Curve Finance and similar protocols

## Architecture

### Core Components

1. **VotingEscrow** - Time-locked token contract
   - Lock tokens for up to 4 years
   - Voting power decays linearly to unlock time
   - Non-transferable veTokens

2. **GaugeController** - Vote aggregation and weight management
   - Register gauges (pools/vaults)
   - Aggregate votes from veToken holders
   - Calculate relative weights weekly

3. **LiquidityGauge** - Individual staking contract per pool
   - Stake LP tokens
   - Earn proportional rewards
   - Checkpoint-based accounting

4. **Minter** - Reward distribution
   - Mint rewards based on gauge weights
   - Configurable emission schedule
   - Anti-inflation decay mechanism

### Workflow

```
1. User locks tokens → receives veTokens (voting power)
2. User votes for gauge(s) → allocates voting power
3. Gauge weights updated weekly → determines emission split
4. User stakes LP tokens in gauge → begins earning rewards
5. Rewards accumulate based on:
   - User's share of gauge
   - Gauge's share of total emissions
6. User claims rewards → receives reward tokens
```

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | >= 18.x (recommended 20.x LTS) |
| npm | >= 9.x |
| Hardhat | ^2.19.4 |
| Solidity | 0.8.20 |
| ethers.js | ^6.10.0 |
| OpenZeppelin Contracts | ^5.0.1 |

## Installation

```bash
npm install
```

## Usage

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

### Deploy

```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Example Usage

```javascript
// 1. Lock tokens to get voting power
await token.approve(votingEscrow.address, lockAmount);
await votingEscrow.createLock(lockAmount, unlockTime);

// 2. Vote for gauge
await controller.voteForGaugeWeights(gaugeAddress, 10000); // 100% of power

// 3. Stake LP tokens
await lpToken.approve(gauge.address, stakeAmount);
await gauge.deposit(stakeAmount);

// 4. Claim rewards
await gauge.claimRewards();
```

## Project Structure

```
eip-vote-escrowed-gauge/
├── EIPS/
│   └── eip-draft-veGauge.md          # EIP specification
├── contracts/
│   ├── interfaces/                    # Interface definitions
│   │   ├── IVotingEscrow.sol
│   │   ├── IGaugeController.sol
│   │   ├── ILiquidityGauge.sol
│   │   └── IMinter.sol
│   ├── core/                          # Core implementations
│   │   ├── VotingEscrow.sol
│   │   ├── GaugeController.sol
│   │   ├── LiquidityGauge.sol
│   │   └── Minter.sol
│   └── examples/                      # Example contracts
│       ├── SimpleRewardToken.sol
│       ├── ExampleVault.sol
│       └── FullExample.sol
├── test/
│   ├── unit/                          # Unit tests
│   │   ├── VotingEscrow.test.js
│   │   ├── GaugeController.test.js
│   │   └── Minter.test.js
│   └── integration/                   # Integration tests
│       ├── EndToEnd.test.js
│       └── MultiGauge.test.js
└── scripts/
    └── deploy.js                      # Deployment script
```

## Key Concepts

### Vote-Escrowed Tokens

Voting power is calculated as:
```
veToken_balance = locked_amount × (unlock_time - current_time) / MAX_TIME
```

Where `MAX_TIME` = 4 years.

### Gauge Weights

Relative weight determines emissions:
```
gauge_weight = votes_for_gauge / total_votes
gauge_emissions = total_emissions × gauge_weight
```

### Weekly Epochs

- Gauge weights update every Thursday at 00:00 UTC
- Vote changes apply to next epoch
- Prevents manipulation between voting and claiming

## Testing

The test suite includes:

### Unit Tests
- **VotingEscrow**: Lock creation, voting power calculation, withdrawals
- **GaugeController**: Gauge management, voting, weight distribution
- **LiquidityGauge**: Deposits, withdrawals, reward accumulation
- **Minter**: Emission calculations, rate updates

### Integration Tests
- **End-to-End**: Complete user journey from lock to claim
- **Multi-Gauge**: Complex scenarios with multiple gauges and users

Run with:
```bash
npm test
```

## EIP Specification

The full EIP specification is available in `EIPS/eip-draft-veGauge.md`.

Key sections:
- **Abstract**: High-level overview
- **Specification**: Detailed interface definitions
- **Rationale**: Design decisions explained
- **Security Considerations**: Important security notes

## Security Considerations

1. **Lock Time Manipulation**: Enforce minimum/maximum lock durations
2. **Vote Weight Manipulation**: Checkpoint before distributions
3. **Reentrancy**: All external calls use checks-effects-interactions
4. **Integer Overflow**: Use Solidity 0.8+ built-in checks
5. **Front-Running**: Vote changes apply next epoch

## Use Cases

This standard is suitable for:
- Liquidity mining programs
- Protocol treasury management
- DAO resource allocation
- Yield optimization protocols
- Cross-protocol governance

## Real-World Examples

Protocols using this pattern:
- **Curve Finance**: Original implementation (veCRV)
- **Balancer**: Vote-escrowed BAL (veBAL)
- **Frax**: Vote-escrowed FXS (veFXS)
- **Yearn**: Gauge voting for vault rewards

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Reference Implementations

This implementation is inspired by and references the following battle-tested contracts:

### Curve Finance (Vyper - Original)
- [VotingEscrow.vy](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/VotingEscrow.vy)
- [GaugeController.vy](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/GaugeController.vy)
- [LiquidityGauge.vy](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/gauges/LiquidityGauge.vy)
- [Minter.vy](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy)

### Velodrome Finance (Solidity - Optimism)
- [VotingEscrow.sol](https://github.com/velodrome-finance/contracts/blob/main/contracts/VotingEscrow.sol)
- [Voter.sol](https://github.com/velodrome-finance/contracts/blob/main/contracts/Voter.sol)
- [Gauge.sol](https://github.com/velodrome-finance/contracts/blob/main/contracts/Gauge.sol)
- [Minter.sol](https://github.com/velodrome-finance/contracts/blob/main/contracts/Minter.sol)

### Aerodrome Finance (Solidity - Base)
- [VotingEscrow.sol](https://github.com/aerodrome-finance/contracts/blob/main/contracts/VotingEscrow.sol)
- [Voter.sol](https://github.com/aerodrome-finance/contracts/blob/main/contracts/Voter.sol)

### Solidly (Solidity - Original by Andre Cronje)
- [ve.sol](https://github.com/solidlyexchange/solidly/blob/master/contracts/ve.sol)
- [BaseV1-gauges.sol](https://github.com/solidlyexchange/solidly/blob/master/contracts/BaseV1-gauges.sol)

## Resources

- [Curve Finance Documentation](https://curve.readthedocs.io/)
- [EIP Process](https://eips.ethereum.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/)
- [Hardhat Documentation](https://hardhat.org/)

## Contact

For questions or discussions about this standard, please open an issue or start a discussion in the repository.

---

**Note**: This is a reference implementation. Always conduct thorough audits before deploying to mainnet.

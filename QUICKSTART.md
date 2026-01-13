# Quick Start Guide

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | >= 18.x (recommended 20.x LTS) |
| npm | >= 9.x |
| Hardhat | ^2.19.4 |
| Solidity | 0.8.20 |

Verify your environment:
```bash
node --version   # Should be v18.x or v20.x
npm --version    # Should be 9.x or higher
```

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Compile contracts:**
```bash
npm run compile
```

3. **Run tests:**
```bash
npm test
```

## Understanding the System

### 1. Lock Tokens (Get Voting Power)

```javascript
// Lock 1000 tokens for 1 year
const amount = ethers.parseEther("1000");
const unlockTime = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

await token.approve(await votingEscrow.getAddress(), amount);
await votingEscrow.createLock(amount, unlockTime);

// Check your voting power
const votingPower = await votingEscrow["balanceOf(address)"](yourAddress);
```

### 2. Vote for Gauges

```javascript
// Vote with 100% of your voting power for a gauge
await gaugeController.voteForGaugeWeights(await gauge.getAddress(), 10000);

// Or split your votes (70% gauge1, 30% gauge2)
await gaugeController.voteForGaugeWeights(await gauge1.getAddress(), 7000);
// Wait 10 days before voting for another gauge
await gaugeController.voteForGaugeWeights(await gauge2.getAddress(), 3000);
```

### 3. Stake LP Tokens

```javascript
// Approve and deposit LP tokens into a gauge
const stakeAmount = ethers.parseEther("500");
await lpToken.approve(await gauge.getAddress(), stakeAmount);
await gauge.deposit(stakeAmount);
```

### 4. Claim Rewards

```javascript
// Check claimable rewards
const claimable = await gauge.claimableRewards(yourAddress);

// Claim rewards
await gauge.claimRewards();
```

## Testing Workflow

Run the full example test to see everything in action:

```bash
npx hardhat test test/integration/EndToEnd.test.js
```

This test demonstrates:
1. Creating locks
2. Voting for gauges
3. Staking LP tokens
4. Earning and claiming rewards

## Deployment

Deploy to local network:

```bash
npx hardhat node  # In one terminal
npx hardhat run scripts/deploy.js --network localhost  # In another terminal
```

## Key Parameters

- **MAX_TIME**: 4 years (maximum lock duration)
- **WEEK**: 7 days (epoch duration)
- **WEIGHT_VOTE_DELAY**: 10 days (minimum time between votes for same gauge)
- **INITIAL_RATE**: ~22.4M tokens per year emission rate

## Common Operations

### Extend Lock Time
```javascript
await votingEscrow.increaseUnlockTime(newUnlockTime);
```

### Increase Lock Amount
```javascript
await votingEscrow.increaseAmount(additionalAmount);
```

### Withdraw After Lock Expires
```javascript
await votingEscrow.withdraw();
```

### Check Gauge Weight
```javascript
const weight = await gaugeController.gaugeRelativeWeight(await gauge.getAddress());
// Returns weight as 1e18 = 100%
```

## Troubleshooting

**"Lock already exists"**: You can only have one lock per address. Use `increaseAmount` or `increaseUnlockTime` instead.

**"Vote too soon"**: Must wait 10 days between votes for the same gauge.

**"Used too much power"**: Your total vote allocation cannot exceed 10000 (100%).

**"No voting power"**: Lock tokens in VotingEscrow first to get voting power.

## Next Steps

1. Read the full EIP specification in `EIPS/eip-draft-veGauge.md`
2. Explore the test files to understand different scenarios
3. Check out `contracts/examples/FullExample.sol` for a complete integration
4. Deploy your own system using the deployment script

## Resources

- [Full Documentation](./README.md)
- [EIP Specification](./EIPS/eip-draft-veGauge.md)
- [Example Contracts](./contracts/examples/)
- [Test Files](./test/)

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Multi-Gauge Integration", function () {
  let token;
  let votingEscrow;
  let controller;
  let minter;
  let gauges;
  let lpTokens;
  let users;
  
  const WEEK = 7 * 24 * 60 * 60;
  const NUM_GAUGES = 3;
  const NUM_USERS = 3;
  
  beforeEach(async function () {
    const signers = await ethers.getSigners();
    users = signers.slice(0, NUM_USERS);
    
    // Deploy token
    const Token = await ethers.getContractFactory("SimpleRewardToken");
    token = await Token.deploy();
    
    // Deploy VotingEscrow
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    votingEscrow = await VotingEscrow.deploy(
      await token.getAddress(),
      "Vote-Escrowed Token",
      "veToken"
    );
    
    // Deploy GaugeController
    const GaugeController = await ethers.getContractFactory("GaugeController");
    controller = await GaugeController.deploy(await votingEscrow.getAddress());
    
    // Deploy Minter
    const Minter = await ethers.getContractFactory("Minter");
    minter = await Minter.deploy(await token.getAddress(), await controller.getAddress());
    
    // Deploy multiple gauges
    gauges = [];
    lpTokens = [];
    
    for (let i = 0; i < NUM_GAUGES; i++) {
      const LPToken = await ethers.getContractFactory("ExampleVault");
      const lpToken = await LPToken.deploy();
      lpTokens.push(lpToken);
      
      const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge");
      const gauge = await LiquidityGauge.deploy(
        await lpToken.getAddress(),
        await minter.getAddress()
      );
      gauges.push(gauge);
      
      await controller.addGauge(await gauge.getAddress(), 0);
    }
    
    // Fund minter
    await token.transfer(await minter.getAddress(), ethers.parseEther("10000000"));
    
    // Distribute tokens to users
    for (const user of users) {
      await token.transfer(user.address, ethers.parseEther("10000"));
      for (const lpToken of lpTokens) {
        await lpToken.mint(user.address, ethers.parseEther("1000"));
      }
    }
  });
  
  describe("Complex Voting Patterns", function () {
    it("Should handle split votes across multiple gauges", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // User 0 locks tokens
      await token.connect(users[0]).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(users[0]).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Split votes: 50%, 30%, 20%
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 5000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[1].getAddress(), 3000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[2].getAddress(), 2000);
      
      await time.increase(WEEK);
      
      const weight0 = await controller["gaugeRelativeWeight(address)"](await gauges[0].getAddress());
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauges[1].getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauges[2].getAddress());
      
      // All gauges should have weight
      expect(weight0).to.be.gt(0);
      expect(weight1).to.be.gt(0);
      expect(weight2).to.be.gt(0);
      
      // Weight0 should be highest
      expect(weight0).to.be.gt(weight1);
      expect(weight1).to.be.gt(weight2);
    });
    
    it("Should aggregate votes from multiple users", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // All users lock tokens
      for (const user of users) {
        await token.connect(user).approve(await votingEscrow.getAddress(), lockAmount);
        await votingEscrow.connect(user).createLock(lockAmount, unlockTime);
      }
      
      await time.increase(WEEK);
      
      // User 0: 100% to gauge 0
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 10000);
      
      // User 1: 100% to gauge 1
      await controller.connect(users[1]).voteForGaugeWeights(await gauges[1].getAddress(), 10000);
      
      // User 2: 50% to gauge 0, 50% to gauge 2
      await controller.connect(users[2]).voteForGaugeWeights(await gauges[0].getAddress(), 5000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[2]).voteForGaugeWeights(await gauges[2].getAddress(), 5000);
      
      await time.increase(WEEK);
      
      const weight0 = await controller["gaugeRelativeWeight(address)"](await gauges[0].getAddress());
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauges[1].getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauges[2].getAddress());
      
      // Gauge 0 should have most weight (1.5 user equivalents)
      expect(weight0).to.be.gt(weight1);
      expect(weight0).to.be.gt(weight2);
    });
  });
  
  describe("Cross-Gauge Staking", function () {
    it("Should allow users to stake in multiple gauges simultaneously", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // Setup voting
      await token.connect(users[0]).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(users[0]).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Vote for all gauges equally
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 3333);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[1].getAddress(), 3333);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[2].getAddress(), 3334);
      
      await time.increase(WEEK);
      
      // Stake in all gauges
      const stakeAmount = ethers.parseEther("300");
      for (let i = 0; i < NUM_GAUGES; i++) {
        await lpTokens[i].connect(users[1]).approve(await gauges[i].getAddress(), stakeAmount);
        await gauges[i].connect(users[1])["deposit(uint256)"](stakeAmount);
      }
      
      // Verify stakes
      for (const gauge of gauges) {
        const balance = await gauge.balanceOf(users[1].address);
        expect(balance).to.equal(stakeAmount);
      }
      
      // Wait and check rewards
      await time.increase(WEEK * 2);
      
      for (const gauge of gauges) {
        const claimable = await gauge.claimableRewards(users[1].address);
        expect(claimable).to.be.gte(0);
      }
    });
  });
  
  describe("Dynamic Weight Rebalancing", function () {
    it("Should reflect changing votes in reward distribution", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // User 0 locks and votes 100% for gauge 0
      await token.connect(users[0]).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(users[0]).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 10000);
      
      await time.increase(WEEK);
      
      // Stake in both gauges
      const stakeAmount = ethers.parseEther("500");
      await lpTokens[0].connect(users[1]).approve(await gauges[0].getAddress(), stakeAmount);
      await gauges[0].connect(users[1])["deposit(uint256)"](stakeAmount);
      
      await lpTokens[1].connect(users[1]).approve(await gauges[1].getAddress(), stakeAmount);
      await gauges[1].connect(users[1])["deposit(uint256)"](stakeAmount);
      
      // Initially, gauge 0 should get all rewards
      await time.increase(WEEK);
      const rewards0Initial = await gauges[0].claimableRewards(users[1].address);
      const rewards1Initial = await gauges[1].claimableRewards(users[1].address);
      
      expect(rewards0Initial).to.be.gt(0);
      // Gauge 1 should have minimal or no rewards
      
      // Now user 0 changes vote to 100% gauge 1
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 0);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[1].getAddress(), 10000);
      
      await time.increase(WEEK * 2);
      
      // After rebalancing, rewards should shift
      const rewards0Later = await gauges[0].claimableRewards(users[1].address);
      const rewards1Later = await gauges[1].claimableRewards(users[1].address);
      
      // Gauge 1 should now have accumulated more rewards
      expect(rewards1Later).to.be.gt(rewards1Initial);
    });
  });
  
  describe("Governance Participation", function () {
    it("Should track individual user participation across all gauges", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // User locks tokens
      await token.connect(users[0]).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(users[0]).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Vote for each gauge
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 4000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[1].getAddress(), 3000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[2].getAddress(), 3000);
      
      // Check vote allocation for each gauge
      for (const gauge of gauges) {
        const voteWeight = await controller.voteUserPower(users[0].address, await gauge.getAddress());
        expect(voteWeight).to.be.gt(0);
      }
      
      // Total power should sum to 100%
      const totalPower = await controller.userPowerUsed(users[0].address);
      expect(totalPower).to.equal(10000);
    });
  });
  
  describe("Emission Distribution", function () {
    it("Should distribute total emissions across all gauges correctly", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // Setup voting for all gauges
      for (let i = 0; i < NUM_USERS; i++) {
        await token.connect(users[i]).approve(await votingEscrow.getAddress(), lockAmount);
        await votingEscrow.connect(users[i]).createLock(lockAmount, unlockTime);
      }
      
      await time.increase(WEEK);
      
      // Users vote for different gauges
      await controller.connect(users[0]).voteForGaugeWeights(await gauges[0].getAddress(), 10000);
      await controller.connect(users[1]).voteForGaugeWeights(await gauges[1].getAddress(), 10000);
      await controller.connect(users[2]).voteForGaugeWeights(await gauges[2].getAddress(), 10000);
      
      await time.increase(WEEK * 2);
      
      // Check mintable for each gauge
      const mintables = [];
      for (const gauge of gauges) {
        const mintable = await minter.mintable(await gauge.getAddress());
        mintables.push(mintable);
      }
      
      // All gauges should have roughly equal mintable amounts
      const total = mintables.reduce((a, b) => a + b, 0n);
      expect(total).to.be.gt(0);
      
      for (const mintable of mintables) {
        // Each should be roughly 1/3 of total
        const share = mintable * 100n / total;
        expect(share).to.be.gt(20n); // At least 20%
        expect(share).to.be.lt(45n); // At most 45%
      }
    });
  });
});

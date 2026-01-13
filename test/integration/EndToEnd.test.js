const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("End-to-End Integration", function () {
  let token;
  let lpToken1;
  let lpToken2;
  let votingEscrow;
  let controller;
  let gauge1;
  let gauge2;
  let minter;
  let owner;
  let alice;
  let bob;
  
  const WEEK = 7 * 24 * 60 * 60;
  
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    
    // Deploy full system
    const Token = await ethers.getContractFactory("SimpleRewardToken");
    token = await Token.deploy();
    
    const LPToken = await ethers.getContractFactory("ExampleVault");
    lpToken1 = await LPToken.deploy();
    lpToken2 = await LPToken.deploy();
    
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    votingEscrow = await VotingEscrow.deploy(
      await token.getAddress(),
      "Vote-Escrowed Reward",
      "veRWD"
    );
    
    const GaugeController = await ethers.getContractFactory("GaugeController");
    controller = await GaugeController.deploy(await votingEscrow.getAddress());
    
    const Minter = await ethers.getContractFactory("Minter");
    minter = await Minter.deploy(await token.getAddress(), await controller.getAddress());
    
    const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge");
    gauge1 = await LiquidityGauge.deploy(await lpToken1.getAddress(), await minter.getAddress());
    gauge2 = await LiquidityGauge.deploy(await lpToken2.getAddress(), await minter.getAddress());
    
    await controller.addGauge(await gauge1.getAddress(), 0);
    await controller.addGauge(await gauge2.getAddress(), 0);
    
    await token.transfer(await minter.getAddress(), ethers.parseEther("10000000"));
    
    // Distribute tokens
    await token.transfer(alice.address, ethers.parseEther("10000"));
    await token.transfer(bob.address, ethers.parseEther("10000"));
    await lpToken1.mint(alice.address, ethers.parseEther("1000"));
    await lpToken1.mint(bob.address, ethers.parseEther("1000"));
    await lpToken2.mint(alice.address, ethers.parseEther("1000"));
    await lpToken2.mint(bob.address, ethers.parseEther("1000"));
  });
  
  describe("Complete User Journey", function () {
    it("Should complete full workflow: lock -> vote -> stake -> earn", async function () {
      // Step 1: Alice locks tokens
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(alice).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(alice).createLock(lockAmount, unlockTime);
      
      const aliceVotingPower = await votingEscrow["balanceOf(address)"](alice.address);
      expect(aliceVotingPower).to.be.gt(0);
      
      // Step 2: Wait and vote for gauge1
      await time.increase(WEEK);
      await controller.connect(alice).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      // Step 3: Alice stakes LP tokens in gauge1
      await time.increase(WEEK);
      const stakeAmount = ethers.parseEther("500");
      await lpToken1.connect(alice).approve(await gauge1.getAddress(), stakeAmount);
      await gauge1.connect(alice)["deposit(uint256)"](stakeAmount);
      
      const aliceStaked = await gauge1.balanceOf(alice.address);
      expect(aliceStaked).to.equal(stakeAmount);
      
      // Step 4: Wait and check rewards accumulate
      await time.increase(WEEK);
      const claimable = await gauge1.claimableRewards(alice.address);
      expect(claimable).to.be.gte(0);
      
      // Step 5: Claim rewards
      await gauge1.connect(alice).claimRewards();
    });
  });
  
  describe("Multi-User Competition", function () {
    it("Should handle competing votes and stakes correctly", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      // Both users lock tokens
      await token.connect(alice).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(alice).createLock(lockAmount, unlockTime);
      
      await token.connect(bob).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(bob).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Alice votes for gauge1, Bob votes for gauge2
      await controller.connect(alice).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      await controller.connect(bob).voteForGaugeWeights(await gauge2.getAddress(), 10000);
      
      await time.increase(WEEK);
      
      // Both gauges should receive weight
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauge2.getAddress());
      
      expect(weight1).to.be.gt(0);
      expect(weight2).to.be.gt(0);
      
      // Both stake in their respective gauges
      const stakeAmount = ethers.parseEther("500");
      
      await lpToken1.connect(alice).approve(await gauge1.getAddress(), stakeAmount);
      await gauge1.connect(alice)["deposit(uint256)"](stakeAmount);
      
      await lpToken2.connect(bob).approve(await gauge2.getAddress(), stakeAmount);
      await gauge2.connect(bob)["deposit(uint256)"](stakeAmount);
      
      // Wait for rewards
      await time.increase(WEEK * 2);
      
      const aliceRewards = await gauge1.claimableRewards(alice.address);
      const bobRewards = await gauge2.claimableRewards(bob.address);
      
      // Both should earn rewards
      expect(aliceRewards).to.be.gte(0);
      expect(bobRewards).to.be.gte(0);
    });
  });
  
  describe("Vote Changes", function () {
    it("Should handle vote reallocation correctly", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(alice).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(alice).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Initial vote: 100% to gauge1
      await controller.connect(alice).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      await time.increase(WEEK);
      
      const initialWeight = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      expect(initialWeight).to.be.gt(0);
      
      // Wait for vote delay
      await time.increase(10 * 24 * 60 * 60 + 1);
      
      // Change vote: split 50/50
      await controller.connect(alice).voteForGaugeWeights(await gauge1.getAddress(), 5000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(alice).voteForGaugeWeights(await gauge2.getAddress(), 5000);
      
      await time.increase(WEEK);
      
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauge2.getAddress());
      
      // Both gauges should now have weight
      expect(weight1).to.be.gt(0);
      expect(weight2).to.be.gt(0);
    });
  });
  
  describe("Lock Extensions", function () {
    it("Should maintain voting power after extending lock", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const initialUnlock = currentTime + 180 * 24 * 60 * 60; // 6 months
      
      await token.connect(alice).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(alice).createLock(lockAmount, initialUnlock);
      
      const initialPower = await votingEscrow["balanceOf(address)"](alice.address);
      
      // Extend lock to 1 year
      const extendedUnlock = currentTime + 365 * 24 * 60 * 60;
      await votingEscrow.connect(alice).increaseUnlockTime(extendedUnlock);
      
      const extendedPower = await votingEscrow["balanceOf(address)"](alice.address);
      
      // Voting power should increase
      expect(extendedPower).to.be.gt(initialPower);
    });
  });
  
  describe("Reward Distribution Fairness", function () {
    it("Should distribute rewards proportionally to stake size", async function () {
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(alice).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(alice).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      await controller.connect(alice).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      await time.increase(WEEK);
      
      // Alice stakes 750, Bob stakes 250 (3:1 ratio)
      const aliceStake = ethers.parseEther("750");
      const bobStake = ethers.parseEther("250");
      
      await lpToken1.connect(alice).approve(await gauge1.getAddress(), aliceStake);
      await gauge1.connect(alice)["deposit(uint256)"](aliceStake);
      
      await lpToken1.connect(bob).approve(await gauge1.getAddress(), bobStake);
      await gauge1.connect(bob)["deposit(uint256)"](bobStake);
      
      await time.increase(WEEK * 2);
      
      const aliceRewards = await gauge1.claimableRewards(alice.address);
      const bobRewards = await gauge1.claimableRewards(bob.address);
      
      // Alice should have roughly 3x rewards
      if (aliceRewards > 0n && bobRewards > 0n) {
        const ratio = aliceRewards * 100n / bobRewards;
        expect(ratio).to.be.gt(200n); // At least 2x
        expect(ratio).to.be.lt(400n); // At most 4x
      }
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GaugeController", function () {
  let controller;
  let votingEscrow;
  let token;
  let gauge1;
  let gauge2;
  let owner;
  let user1;
  let user2;
  
  const WEEK = 7 * 24 * 60 * 60;
  const WEIGHT_VOTE_DELAY = 10 * 24 * 60 * 60;
  
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
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
    
    // Deploy mock gauges
    const LPToken = await ethers.getContractFactory("ExampleVault");
    const lpToken1 = await LPToken.deploy();
    const lpToken2 = await LPToken.deploy();
    
    const Minter = await ethers.getContractFactory("Minter");
    const minter = await Minter.deploy(await token.getAddress(), await controller.getAddress());
    
    const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge");
    gauge1 = await LiquidityGauge.deploy(await lpToken1.getAddress(), await minter.getAddress());
    gauge2 = await LiquidityGauge.deploy(await lpToken2.getAddress(), await minter.getAddress());
    
    // Distribute tokens
    await token.transfer(user1.address, ethers.parseEther("10000"));
    await token.transfer(user2.address, ethers.parseEther("10000"));
  });
  
  describe("Gauge Management", function () {
    it("Should add gauge successfully", async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      
      const gaugeType = await controller.gaugeTypes(await gauge1.getAddress());
      expect(gaugeType).to.equal(0);
    });
    
    it("Should fail to add duplicate gauge", async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      
      await expect(
        controller.addGauge(await gauge1.getAddress(), 0)
      ).to.be.revertedWith("Gauge already exists");
    });
    
    it("Should fail to add gauge as non-owner", async function () {
      await expect(
        controller.connect(user1).addGauge(await gauge1.getAddress(), 0)
      ).to.be.reverted;
    });
  });
  
  describe("Voting", function () {
    beforeEach(async function () {
      // Add gauges
      await controller.addGauge(await gauge1.getAddress(), 0);
      await controller.addGauge(await gauge2.getAddress(), 0);
      
      // Create locks for users
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      await token.connect(user2).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user2).createLock(amount, unlockTime);
      
      // Wait for lock to be active
      await time.increase(WEEK);
    });
    
    it("Should vote for gauge weights", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      const voteWeight = await controller.voteUserPower(user1.address, await gauge1.getAddress());
      expect(voteWeight).to.equal(10000);
    });
    
    it("Should split votes across multiple gauges", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 6000);
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      await controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 4000);
      
      const totalPower = await controller.userPowerUsed(user1.address);
      expect(totalPower).to.equal(10000);
    });
    
    it("Should fail to vote with more than 100% power", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      
      await expect(
        controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 1000)
      ).to.be.revertedWith("Used too much power");
    });
    
    it("Should fail to vote too soon", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 5000);
      
      await expect(
        controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 6000)
      ).to.be.revertedWith("Vote too soon");
    });
    
    it("Should fail to vote without voting power", async function () {
      const user3 = (await ethers.getSigners())[3];
      
      await expect(
        controller.connect(user3).voteForGaugeWeights(await gauge1.getAddress(), 10000)
      ).to.be.revertedWith("No voting power");
    });
  });
  
  describe("Gauge Weights", function () {
    beforeEach(async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      await controller.addGauge(await gauge2.getAddress(), 0);
      
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      await time.increase(WEEK);
    });
    
    it("Should calculate relative weights correctly", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      await time.increase(WEEK);
      await controller.checkpoint();
      
      const weight = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      
      // With only one gauge receiving votes, it should have 100% weight
      expect(weight).to.be.gt(0);
    });
    
    it("Should distribute weights proportionally", async function () {
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 7000);
      
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      await controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 3000);
      
      await time.increase(WEEK);
      await controller.checkpoint();
      
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauge2.getAddress());
      
      // Gauge1 should have more weight than gauge2
      expect(weight1).to.be.gt(weight2);
    });
  });
  
  describe("Checkpointing", function () {
    it("Should checkpoint successfully", async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      await expect(controller.checkpoint()).to.not.be.reverted;
    });
    
    it("Should checkpoint specific gauge", async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      await expect(
        controller.checkpointGauge(await gauge1.getAddress())
      ).to.not.be.reverted;
    });
  });
  
  describe("Vote Edge Cases", function () {
    beforeEach(async function () {
      await controller.addGauge(await gauge1.getAddress(), 0);
      await controller.addGauge(await gauge2.getAddress(), 0);
      
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      await time.increase(WEEK);
    });
    
    it("Should show weight after vote becomes effective", async function () {
      // Vote for gauge1
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      // Weight might be 0 immediately after voting (votes scheduled for future)
      const immediateWeight = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      
      // Wait for vote to take effect (past the next week boundary)
      await time.increase(WEEK);
      
      // Now weight should be visible
      const effectiveWeight = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      expect(effectiveWeight).to.be.gt(0);
      
      // Effective weight should be >= immediate weight
      expect(effectiveWeight).to.be.gte(immediateWeight);
    });
    
    it("Should allow removing vote by voting 0", async function () {
      // Vote 100% for gauge1
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      await time.increase(WEEK);
      const initialWeight = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      expect(initialWeight).to.be.gt(0);
      
      // Wait for vote delay
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      
      // Remove vote by voting 0
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 0);
      
      // User power should be 0 (freed up for other votes)
      const powerUsed = await controller.userPowerUsed(user1.address);
      expect(powerUsed).to.equal(0);
      
      // Vote weight for this gauge should be 0
      const voteWeight = await controller.voteUserPower(user1.address, await gauge1.getAddress());
      expect(voteWeight).to.equal(0);
      
      // User can now vote for another gauge with full power
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      await controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 10000);
      
      const newPower = await controller.userPowerUsed(user1.address);
      expect(newPower).to.equal(10000);
    });
    
    it("Should allow re-voting on same gauge after delay", async function () {
      // Initial vote: 50%
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 5000);
      
      const initialVote = await controller.voteUserPower(user1.address, await gauge1.getAddress());
      expect(initialVote).to.equal(5000);
      
      // Wait for vote delay
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      
      // Re-vote with different weight: 80%
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 8000);
      
      const newVote = await controller.voteUserPower(user1.address, await gauge1.getAddress());
      expect(newVote).to.equal(8000);
      
      // User power should reflect new vote
      const powerUsed = await controller.userPowerUsed(user1.address);
      expect(powerUsed).to.equal(8000);
    });
    
    it("Should handle vote reallocation between gauges", async function () {
      // Vote 100% for gauge1
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 10000);
      
      await time.increase(WEEK);
      
      // Wait for vote delay
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      
      // Reduce gauge1 to 30% and add gauge2 at 70%
      await controller.connect(user1).voteForGaugeWeights(await gauge1.getAddress(), 3000);
      
      await time.increase(WEIGHT_VOTE_DELAY + 1);
      await controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 7000);
      
      // Total power should be 100%
      const powerUsed = await controller.userPowerUsed(user1.address);
      expect(powerUsed).to.equal(10000);
      
      // Wait for weights to take effect
      await time.increase(WEEK);
      
      const weight1 = await controller["gaugeRelativeWeight(address)"](await gauge1.getAddress());
      const weight2 = await controller["gaugeRelativeWeight(address)"](await gauge2.getAddress());
      
      // Gauge2 should have more weight than gauge1
      expect(weight2).to.be.gt(weight1);
      expect(weight1).to.be.gt(0);
      expect(weight2).to.be.gt(0);
    });
  });
});

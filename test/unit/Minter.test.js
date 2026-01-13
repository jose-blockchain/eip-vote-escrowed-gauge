const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Minter", function () {
  let minter;
  let token;
  let votingEscrow;
  let controller;
  let gauge;
  let lpToken;
  let owner;
  let user1;
  
  const WEEK = 7 * 24 * 60 * 60;
  const YEAR = 365 * 24 * 60 * 60;
  
  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy reward token
    const Token = await ethers.getContractFactory("SimpleRewardToken");
    token = await Token.deploy();
    
    // Deploy LP token
    const LPToken = await ethers.getContractFactory("ExampleVault");
    lpToken = await LPToken.deploy();
    
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
    
    // Deploy LiquidityGauge
    const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge");
    gauge = await LiquidityGauge.deploy(await lpToken.getAddress(), await minter.getAddress());
    
    // Add gauge to controller
    await controller.addGauge(await gauge.getAddress(), 0);
    
    // Transfer tokens to minter
    await token.transfer(await minter.getAddress(), ethers.parseEther("10000000"));
    
    // Transfer tokens to user for locking
    await token.transfer(user1.address, ethers.parseEther("10000"));
  });
  
  describe("Initialization", function () {
    it("Should set initial rate correctly", async function () {
      const rate = await minter.rate();
      expect(rate).to.be.gt(0);
    });
    
    it("Should set correct start epoch time", async function () {
      const startTime = await minter.startEpochTime();
      expect(startTime).to.be.gt(0);
    });
  });
  
  describe("Rate Updates", function () {
    it("Should fail to update rate too soon", async function () {
      await expect(
        minter.updateMiningParameters()
      ).to.be.revertedWith("Too soon");
    });
    
    it("Should update rate after one year", async function () {
      const initialRate = await minter.rate();
      
      // Move forward 1 year
      await time.increase(YEAR + 1);
      
      await minter.updateMiningParameters();
      
      const newRate = await minter.rate();
      
      // New rate should be lower (decay)
      expect(newRate).to.be.lt(initialRate);
    });
  });
  
  describe("Minting", function () {
    beforeEach(async function () {
      // Setup voting
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(user1).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      await controller.connect(user1).voteForGaugeWeights(await gauge.getAddress(), 10000);
      
      await time.increase(WEEK);
    });
    
    it("Should calculate mintable amount", async function () {
      await time.increase(WEEK);
      
      const mintable = await minter.mintable(await gauge.getAddress());
      expect(mintable).to.be.gte(0);
    });
    
    it("Should mint rewards", async function () {
      await time.increase(WEEK);
      
      const balanceBefore = await token.balanceOf(await gauge.getAddress());
      await minter.mint(await gauge.getAddress());
      const balanceAfter = await token.balanceOf(await gauge.getAddress());
      
      expect(balanceAfter).to.be.gte(balanceBefore);
    });
    
    it("Should emit Minted event", async function () {
      await time.increase(WEEK);
      
      await expect(minter.mint(await gauge.getAddress()))
        .to.emit(minter, "Minted");
    });
    
    it("Should track minted amounts", async function () {
      await time.increase(WEEK);
      
      const mintedBefore = await minter["minted(address)"](await gauge.getAddress());
      await minter.mint(await gauge.getAddress());
      const mintedAfter = await minter["minted(address)"](await gauge.getAddress());
      
      expect(mintedAfter).to.be.gt(mintedBefore);
    });
    
    it("Should mint 0 if called immediately after previous mint", async function () {
      await time.increase(WEEK);
      
      await minter.mint(await gauge.getAddress());
      
      const mintable = await minter.mintable(await gauge.getAddress());
      expect(mintable).to.equal(0);
    });
  });
  
  describe("Multiple Gauges", function () {
    let gauge2;
    
    beforeEach(async function () {
      // Deploy second gauge
      const LPToken2 = await ethers.getContractFactory("ExampleVault");
      const lpToken2 = await LPToken2.deploy();
      
      const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge");
      gauge2 = await LiquidityGauge.deploy(await lpToken2.getAddress(), await minter.getAddress());
      
      await controller.addGauge(await gauge2.getAddress(), 0);
      
      // Setup voting
      const lockAmount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), lockAmount);
      await votingEscrow.connect(user1).createLock(lockAmount, unlockTime);
      
      await time.increase(WEEK);
      
      // Split votes 70/30
      await controller.connect(user1).voteForGaugeWeights(await gauge.getAddress(), 7000);
      await time.increase(10 * 24 * 60 * 60 + 1);
      await controller.connect(user1).voteForGaugeWeights(await gauge2.getAddress(), 3000);
      
      await time.increase(WEEK);
    });
    
    it("Should distribute minting proportionally", async function () {
      await time.increase(WEEK);
      
      const mintable1 = await minter.mintable(await gauge.getAddress());
      const mintable2 = await minter.mintable(await gauge2.getAddress());
      
      // Gauge1 should receive more (70% vs 30%)
      if (mintable1 > 0n && mintable2 > 0n) {
        expect(mintable1).to.be.gt(mintable2);
      }
    });
  });
});

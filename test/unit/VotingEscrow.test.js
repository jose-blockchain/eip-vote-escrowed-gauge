const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingEscrow", function () {
  let votingEscrow;
  let token;
  let owner;
  let user1;
  let user2;
  
  const WEEK = 7 * 24 * 60 * 60;
  const MAX_TIME = 4 * 365 * 24 * 60 * 60;
  
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
    
    // Distribute tokens
    await token.transfer(user1.address, ethers.parseEther("10000"));
    await token.transfer(user2.address, ethers.parseEther("10000"));
  });
  
  describe("Lock Creation", function () {
    it("Should create a lock successfully", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      const locked = await votingEscrow.locked(user1.address);
      expect(locked.amount).to.equal(amount);
    });
    
    it("Should fail to create lock with 0 amount", async function () {
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await expect(
        votingEscrow.connect(user1).createLock(0, unlockTime)
      ).to.be.revertedWith("Amount must be > 0");
    });
    
    it("Should fail to create lock with past unlock time", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const pastTime = currentTime - 1000;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await expect(
        votingEscrow.connect(user1).createLock(amount, pastTime)
      ).to.be.revertedWith("Unlock time must be in future");
    });
    
    it("Should fail to create lock beyond max time", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const farFuture = currentTime + MAX_TIME + WEEK * 52; // Well beyond max time
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await expect(
        votingEscrow.connect(user1).createLock(amount, farFuture)
      ).to.be.revertedWith("Unlock time too far");
    });
  });
  
  describe("Voting Power", function () {
    it("Should calculate voting power correctly", async function () {
      const amount = ethers.parseEther("1000");
      const lockDuration = 365 * 24 * 60 * 60; // 1 year
      const currentTime = await time.latest();
      const unlockTime = currentTime + lockDuration;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      const balance = await votingEscrow["balanceOf(address)"](user1.address);
      
      // Voting power should be roughly amount * (lock_time / MAX_TIME)
      // For 1 year lock, should be ~25% of amount
      expect(balance).to.be.gt(0);
      expect(balance).to.be.lt(amount);
    });
    
    it("Should show voting power decay over time", async function () {
      const amount = ethers.parseEther("1000");
      const lockDuration = 365 * 24 * 60 * 60;
      const currentTime = await time.latest();
      const unlockTime = currentTime + lockDuration;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      const initialBalance = await votingEscrow["balanceOf(address)"](user1.address);
      
      // Move forward 6 months
      await time.increase(180 * 24 * 60 * 60);
      
      const laterBalance = await votingEscrow["balanceOf(address)"](user1.address);
      
      // Voting power should have decreased
      expect(laterBalance).to.be.lt(initialBalance);
    });
  });
  
  describe("Lock Management", function () {
    it("Should increase lock amount", async function () {
      const initialAmount = ethers.parseEther("1000");
      const additionalAmount = ethers.parseEther("500");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), initialAmount);
      await votingEscrow.connect(user1).createLock(initialAmount, unlockTime);
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), additionalAmount);
      await votingEscrow.connect(user1).increaseAmount(additionalAmount);
      
      const locked = await votingEscrow.locked(user1.address);
      expect(locked.amount).to.equal(initialAmount + additionalAmount);
    });
    
    it("Should extend unlock time", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const initialUnlock = currentTime + 180 * 24 * 60 * 60;
      const extendedUnlock = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, initialUnlock);
      
      await votingEscrow.connect(user1).increaseUnlockTime(extendedUnlock);
      
      const locked = await votingEscrow.locked(user1.address);
      expect(locked.end).to.be.gte(extendedUnlock - WEEK);
    });
    
    it("Should withdraw after lock expires", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + WEEK; // Short lock for testing (must be at least 1 week due to rounding)
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      // Move time forward past unlock
      await time.increase(WEEK + 100);
      
      const balanceBefore = await token.balanceOf(user1.address);
      await votingEscrow.connect(user1).withdraw();
      const balanceAfter = await token.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
    
    it("Should fail to withdraw before expiry", async function () {
      const amount = ethers.parseEther("1000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount);
      await votingEscrow.connect(user1).createLock(amount, unlockTime);
      
      await expect(
        votingEscrow.connect(user1).withdraw()
      ).to.be.revertedWith("Lock not expired");
    });
  });
  
  describe("Total Supply", function () {
    it("Should track total voting power", async function () {
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("2000");
      const currentTime = await time.latest();
      const unlockTime = currentTime + 365 * 24 * 60 * 60;
      
      await token.connect(user1).approve(await votingEscrow.getAddress(), amount1);
      await votingEscrow.connect(user1).createLock(amount1, unlockTime);
      
      await token.connect(user2).approve(await votingEscrow.getAddress(), amount2);
      await votingEscrow.connect(user2).createLock(amount2, unlockTime);
      
      const totalSupply = await votingEscrow["totalSupply()"]();
      
      expect(totalSupply).to.be.gt(0);
    });
  });
});

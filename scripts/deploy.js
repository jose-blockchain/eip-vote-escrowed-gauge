const hre = require("hardhat");

async function main() {
  console.log("Deploying Vote-Escrowed Gauge System...\n");
  
  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString(), "\n");
  
  // 1. Deploy Reward Token
  console.log("1. Deploying Reward Token...");
  const Token = await hre.ethers.getContractFactory("SimpleRewardToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log("   Reward Token deployed to:", await token.getAddress());
  
  // 2. Deploy VotingEscrow
  console.log("\n2. Deploying VotingEscrow...");
  const VotingEscrow = await hre.ethers.getContractFactory("VotingEscrow");
  const votingEscrow = await VotingEscrow.deploy(
    await token.getAddress(),
    "Vote-Escrowed Reward Token",
    "veRWD"
  );
  await votingEscrow.waitForDeployment();
  console.log("   VotingEscrow deployed to:", await votingEscrow.getAddress());
  
  // 3. Deploy GaugeController
  console.log("\n3. Deploying GaugeController...");
  const GaugeController = await hre.ethers.getContractFactory("GaugeController");
  const controller = await GaugeController.deploy(await votingEscrow.getAddress());
  await controller.waitForDeployment();
  console.log("   GaugeController deployed to:", await controller.getAddress());
  
  // 4. Deploy Minter
  console.log("\n4. Deploying Minter...");
  const Minter = await hre.ethers.getContractFactory("Minter");
  const minter = await Minter.deploy(
    await token.getAddress(),
    await controller.getAddress()
  );
  await minter.waitForDeployment();
  console.log("   Minter deployed to:", await minter.getAddress());
  
  // 5. Deploy Example LP Token
  console.log("\n5. Deploying Example LP Token...");
  const LPToken = await hre.ethers.getContractFactory("ExampleVault");
  const lpToken = await LPToken.deploy();
  await lpToken.waitForDeployment();
  console.log("   LP Token deployed to:", await lpToken.getAddress());
  
  // 6. Deploy LiquidityGauge
  console.log("\n6. Deploying LiquidityGauge...");
  const LiquidityGauge = await hre.ethers.getContractFactory("LiquidityGauge");
  const gauge = await LiquidityGauge.deploy(
    await lpToken.getAddress(),
    await minter.getAddress()
  );
  await gauge.waitForDeployment();
  console.log("   LiquidityGauge deployed to:", await gauge.getAddress());
  
  // 7. Add gauge to controller
  console.log("\n7. Configuring GaugeController...");
  const addGaugeTx = await controller.addGauge(await gauge.getAddress(), 0);
  await addGaugeTx.wait();
  console.log("   Gauge added to controller");
  
  // 8. Transfer tokens to minter
  console.log("\n8. Transferring tokens to Minter...");
  const transferAmount = hre.ethers.parseEther("100000000"); // 100M tokens
  const transferTx = await token.transfer(await minter.getAddress(), transferAmount);
  await transferTx.wait();
  console.log("   Transferred", hre.ethers.formatEther(transferAmount), "tokens to Minter");
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("-------------------");
  console.log("Reward Token:       ", await token.getAddress());
  console.log("VotingEscrow:       ", await votingEscrow.getAddress());
  console.log("GaugeController:    ", await controller.getAddress());
  console.log("Minter:             ", await minter.getAddress());
  console.log("Example LP Token:   ", await lpToken.getAddress());
  console.log("LiquidityGauge:     ", await gauge.getAddress());
  
  console.log("\n" + "=".repeat(60));
  console.log("NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("1. Lock tokens in VotingEscrow to get voting power");
  console.log("2. Vote for gauge weights using GaugeController");
  console.log("3. Deposit LP tokens into LiquidityGauge");
  console.log("4. Wait for rewards to accumulate");
  console.log("5. Claim rewards from LiquidityGauge");
  console.log("=".repeat(60) + "\n");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      token: await token.getAddress(),
      votingEscrow: await votingEscrow.getAddress(),
      gaugeController: await controller.getAddress(),
      minter: await minter.getAddress(),
      exampleLPToken: await lpToken.getAddress(),
      liquidityGauge: await gauge.getAddress()
    }
  };
  
  console.log("\nDeployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

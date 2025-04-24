// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
const hre = require("hardhat");

async function main() {
  console.log("Deploying CrestRFQSettlement contract...");

  const CrestRFQSettlement = await hre.ethers.getContractFactory("CrestRFQSettlement");
  const settlement = await CrestRFQSettlement.deploy();

  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  console.log(`CrestRFQSettlement deployed to: ${settlementAddress}`);

  // For verification purposes
  console.log("Deployment arguments: []");

  // Wait for a few confirmations before verification
  console.log("Waiting for confirmations...");
  await hre.ethers.provider.waitForTransaction(settlement.deploymentTransaction().hash, 5);

  // Verify contract on Etherscan if not on a local network
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      console.log("Verifying contract on Etherscan...");
      await hre.run("verify:verify", {
        address: settlementAddress,
        constructorArguments: [],
      });
      console.log("Contract verified on Etherscan!");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
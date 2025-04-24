import hre from "hardhat";

async function main() {
  console.log("Deploying Settlement contract...");

  // Deploy contract and extract transaction hash during deployment
  const { deploymentTransaction, contract: settlement } = await hre.viem.sendDeploymentTransaction(
    "Settlement",
    []
  );
  const settlementAddress = await settlement.address;

  console.log(`Settlement deployed to: ${settlementAddress}`);
  console.log("Deployment arguments: []");

  // Verify contract on Etherscan if not on a local network
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      console.log("Waiting for confirmations before verification...");
      // Wait for some confirmations before verification
      const publicClient = await hre.viem.getPublicClient();
      await publicClient.waitForTransactionReceipt({
        hash: deploymentTransaction.hash,
        confirmations: 5
      });

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
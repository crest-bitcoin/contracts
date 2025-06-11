import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying Settlement contract to Citrea testnet...");
  console.log("Network:", hre.network.name);

  // Option to use existing WCBTC address or deploy new one
  // Set this to an existing WCBTC address if you want to use an existing deployment
  const existingWCBTCAddress: string | null = "0x4370e27f7d91d9341bff232d7ee8bdfe3a9933a0";

  // Get deployer account
  const walletClients = await hre.viem.getWalletClients();
  if (walletClients.length === 0) {
    throw new Error("No wallet clients available. Please check your private key in .env file.");
  }

  const [deployer] = walletClients;
  console.log("Deploying with account:", deployer.account.address);

  // Check deployer balance
  const publicClient = await hre.viem.getPublicClient();
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Deployer balance:", (Number(balance) / 1e18).toFixed(4), "cBTC");

  if (balance === 0n) {
    throw new Error("Deployer account has no cBTC balance. Please fund the account first.");
  }

  let wcbtcAddress: string;
  let wcbtcContract: any;

  // Deploy or use existing WCBTC
  if (existingWCBTCAddress) {
    wcbtcAddress = existingWCBTCAddress;
    console.log(`\n🔗 Using existing WCBTC contract at: ${wcbtcAddress}`);

    // Verify the WCBTC contract exists and is valid
    try {
      wcbtcContract = await hre.viem.getContractAt("WCBTC" as any, wcbtcAddress as `0x${string}`);
      const name = await wcbtcContract.read.name();
      const symbol = await wcbtcContract.read.symbol();
      console.log(`✅ WCBTC contract verified: ${name} (${symbol})`);
    } catch (error) {
      throw new Error(`Failed to verify existing WCBTC contract at ${wcbtcAddress}: ${error}`);
    }
  } else {
    console.log("\n📦 Step 1: Deploying new WCBTC contract...");
    wcbtcContract = await hre.viem.deployContract("WCBTC" as any, []);
    wcbtcAddress = wcbtcContract.address;
    console.log(`✅ WCBTC deployed to: ${wcbtcAddress}`);
  }

  console.log(`\n📦 Step ${existingWCBTCAddress ? '2' : '2'}: Deploying Settlement contract...`);

  // Deploy Settlement with WCBTC address
  const settlement = await hre.viem.deployContract("Settlement" as any, [wcbtcAddress]);
  const settlementAddress = settlement.address;

  console.log(`✅ Settlement deployed to: ${settlementAddress}`);
  console.log(`   Constructor args: ["${wcbtcAddress}"]`);

  // Display deployment summary
  console.log("\n🎉 Deployment Summary:");
  console.log("========================");
  console.log(`WCBTC Contract:     ${wcbtcAddress} ${existingWCBTCAddress ? '(existing)' : '(newly deployed)'}`);
  console.log(`Settlement Contract: ${settlementAddress}`);
  console.log(`Network:            ${hre.network.name}`);
  console.log(`Deployer:           ${deployer.account.address}`);

  // Get contract configuration
  try {
    const feeBps = await settlement.read.feeBasisPoints();
    const maxFeeBps = await settlement.read.MAX_FEE_BASIS_POINTS();
    const wcbtcConfigured = await settlement.read.getWCBTCAddress();
    const owner = await settlement.read.owner();

    console.log("\n⚙️  Settlement Contract Configuration:");
    console.log("=====================================");
    console.log(`Fee Basis Points:   ${feeBps} (${Number(feeBps) / 100}%)`);
    console.log(`Max Fee Basis Points: ${maxFeeBps} (${Number(maxFeeBps) / 100}%)`);
    console.log(`WCBTC Address:      ${wcbtcConfigured}`);
    console.log(`WCBTC Match:        ${String(wcbtcConfigured).toLowerCase() === wcbtcAddress.toLowerCase() ? '✅' : '❌'}`);
    console.log(`Contract Owner:     ${owner}`);
    console.log(`Owner Match:        ${String(owner).toLowerCase() === deployer.account.address.toLowerCase() ? '✅' : '❌'}`);

    // Check WCBTC contract details
    const wcbtcName = await wcbtcContract.read.name();
    const wcbtcSymbol = await wcbtcContract.read.symbol();
    const wcbtcDecimals = await wcbtcContract.read.decimals();

    console.log("\n⚙️  WCBTC Contract Configuration:");
    console.log("==================================");
    console.log(`Token Name:         ${wcbtcName}`);
    console.log(`Token Symbol:       ${wcbtcSymbol}`);
    console.log(`Decimals:           ${wcbtcDecimals}`);

  } catch (error) {
    console.log("⚠️  Could not read contract configuration:", error);
  }

  // Verify contracts on block explorer if not on local network
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\n🔍 Preparing for contract verification...");

    try {
      console.log("Waiting for block confirmations...");

      // Wait for confirmations
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

      // Only verify WCBTC if we deployed it
      if (!existingWCBTCAddress) {
        console.log("Verifying WCBTC contract...");
        await hre.run("verify:verify", {
          address: wcbtcAddress,
          constructorArguments: [],
        });
        console.log("✅ WCBTC contract verified!");
      }

      console.log("Verifying Settlement contract...");
      await hre.run("verify:verify", {
        address: settlementAddress,
        constructorArguments: [wcbtcAddress],
      });
      console.log("✅ Settlement contract verified!");

    } catch (error) {
      console.error("❌ Error verifying contracts:", error);
      console.log("You can manually verify contracts later with:");
      if (!existingWCBTCAddress) {
        console.log(`npx hardhat verify --network ${hre.network.name} ${wcbtcAddress}`);
      }
      console.log(`npx hardhat verify --network ${hre.network.name} ${settlementAddress} "${wcbtcAddress}"`);
    }
  }

  console.log("\n🎯 Settlement deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Settlement deployment failed:", error);
    process.exit(1);
  });
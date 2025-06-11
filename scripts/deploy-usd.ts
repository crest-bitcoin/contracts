import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying USD contract to Citrea testnet...");
  console.log("Network:", hre.network.name);

  // Settlement contract address (provided by user)
  const settlementAddress = "0x4856800130915c0fdbabe9338f4b541307748615";

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

  console.log("\n📦 Step 1: Deploying USD contract...");

  // Deploy USD contract with settlement address
  const usd = await hre.viem.deployContract("USD" as any, [settlementAddress]);
  const usdAddress = usd.address;

  console.log(`✅ USD contract deployed to: ${usdAddress}`);
  console.log(`   Constructor args: ["${settlementAddress}"]`);

  console.log("\n🪙 Step 2: Minting 1M USD tokens to deployer...");

  // Mint 1,000,000 USD tokens to deployer (USD has 18 decimals)
  const mintAmount = BigInt("1000000000000000000000000"); // 1M * 10^18

  try {
    const mintTx = await usd.write.mint([deployer.account.address, mintAmount]);
    console.log(`💰 Minting transaction hash: ${mintTx}`);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTx });
    if (receipt.status === 'success') {
      console.log("✅ Successfully minted 1,000,000 USD tokens to deployer!");
    } else {
      console.error("❌ Minting transaction failed");
    }
  } catch (error) {
    console.error("❌ Error minting tokens:", error);
  }

  // Display deployment summary
  console.log("\n🎉 Deployment Summary:");
  console.log("========================");
  console.log(`USD Contract:       ${usdAddress}`);
  console.log(`Settlement Address: ${settlementAddress}`);
  console.log(`Network:            ${hre.network.name}`);
  console.log(`Deployer:           ${deployer.account.address}`);
  console.log(`Minted Amount:      1,000,000 USD`);

  // Get contract configuration
  try {
    const name = await usd.read.name();
    const symbol = await usd.read.symbol();
    const decimals = await usd.read.decimals();
    const totalSupply = await usd.read.totalSupply();
    const deployerBalance = await usd.read.balanceOf([deployer.account.address]);
    const owner = await usd.read.owner();

    console.log("\n⚙️  Contract Configuration:");
    console.log("============================");
    console.log(`Token Name:         ${name}`);
    console.log(`Token Symbol:       ${symbol}`);
    console.log(`Decimals:           ${decimals}`);
    console.log(`Total Supply:       ${Number(totalSupply) / 1e18} ${symbol}`);
    console.log(`Deployer Balance:   ${Number(deployerBalance) / 1e18} ${symbol}`);
    console.log(`Contract Owner:     ${owner}`);
    console.log(`Owner Match:        ${String(owner).toLowerCase() === deployer.account.address.toLowerCase() ? '✅' : '❌'}`);
  } catch (error) {
    console.log("⚠️  Could not read contract configuration:", error);
  }

  // Verify contract on block explorer if not on local network
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\n🔍 Preparing for contract verification...");

    try {
      console.log("Waiting for block confirmations...");

      // Wait for confirmations
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

      console.log("Verifying USD contract...");
      await hre.run("verify:verify", {
        address: usdAddress,
        constructorArguments: [settlementAddress],
      });
      console.log("✅ USD contract verified!");

    } catch (error) {
      console.error("❌ Error verifying contract:", error);
      console.log("You can manually verify the contract later with:");
      console.log(`npx hardhat verify --network ${hre.network.name} ${usdAddress} "${settlementAddress}"`);
    }
  }

  console.log("\n🎯 USD contract deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ USD deployment failed:", error);
    process.exit(1);
  });
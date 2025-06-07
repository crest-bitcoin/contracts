import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";
import { randomBytes } from "crypto";

describe("Settlement", function () {
  let settlement: any;
  let wcbtc: any;
  let tokenA: any;
  let tokenB: any;
  let owner: any;
  let user: any;
  let marketMaker: any;
  let relayer: any;

  // Constants
  const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const DEFAULT_FEE_BPS = 30n; // 0.3%
  const MAX_FEE_BPS = 1000n; // 10%

  // Test parameters
  const amountIn = parseEther("1");
  const amountOut = parseEther("0.9");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
  let quoteId: `0x${string}`;

  // Helper function to calculate expected fee
  function calculateFee(amount: bigint, feeBps: bigint = DEFAULT_FEE_BPS): bigint {
    return (amount * feeBps) / 10000n;
  }

  // Helper function to create QuoteParams
  function createQuoteParams(
    userAddress: string,
    marketMakerAddress: string,
    tokenIn: string = tokenA.address,
    tokenOut: string = tokenB.address
  ) {
    return {
      user: userAddress,
      marketMaker: marketMakerAddress,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      expiry,
      quoteId
    };
  }

  // Helper function to sign quote with EIP-712
  async function signQuote(signer: any, params: any) {
    return await signer.signTypedData({
      domain: {
        name: 'Settlement',
        version: '1',
        chainId: 31337,
        verifyingContract: await settlement.address
      },
      types: {
        Quote: [
          { name: 'user', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'quoteId', type: 'bytes32' },
        ]
      },
      primaryType: 'Quote',
      message: {
        user: params.user,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: params.amountOut,
        expiry: params.expiry,
        quoteId: params.quoteId
      }
    });
  }

  beforeEach(async function () {
    // Get accounts
    [owner, user, marketMaker, relayer] = await hre.viem.getWalletClients();

    // Deploy WCBTC first
    wcbtc = await hre.viem.deployContract("WCBTC", []);

    // Deploy Settlement with WCBTC address
    settlement = await hre.viem.deployContract("Settlement" as any, [wcbtc.address]);

    // Deploy test tokens
    tokenA = await hre.viem.deployContract("MockToken", ["Token A", "TKA", 18]);
    tokenB = await hre.viem.deployContract("MockToken", ["Token B", "TKB", 18]);

    // Mint tokens
    await tokenA.write.mint([user.account.address, parseEther("1000")]);
    await tokenB.write.mint([marketMaker.account.address, parseEther("1000")]);

    // Market maker gets WCBTC for native token trades
    await wcbtc.write.deposit({ value: parseEther("10"), account: marketMaker.account });

    // Approvals for ERC20 tokens
    await tokenA.write.approve([settlement.address, parseEther("1000")], { account: user.account });
    await tokenB.write.approve([settlement.address, parseEther("1000")], { account: marketMaker.account });
    await wcbtc.write.approve([settlement.address, parseEther("10")], { account: marketMaker.account });

    // Generate unique quote ID for each test
    quoteId = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  });

  describe("Contract Deployment", function () {
    it("should deploy with correct WCBTC address", async function () {
      const wcbtcAddress = await settlement.read.getWCBTCAddress();
      expect(wcbtcAddress.toLowerCase()).to.equal(wcbtc.address.toLowerCase());
    });

    it("should have correct initial fee settings", async function () {
      const feeBps = await settlement.read.feeBasisPoints();
      const maxFeeBps = await settlement.read.MAX_FEE_BASIS_POINTS();

      expect(feeBps).to.equal(DEFAULT_FEE_BPS);
      expect(maxFeeBps).to.equal(MAX_FEE_BPS);
    });
  });

  describe("Fee Management", function () {
    it("should allow owner to update fee", async function () {
      const newFee = 50n; // 0.5%
      await settlement.write.setFeeBasisPoints([newFee], { account: owner.account });

      const updatedFee = await settlement.read.feeBasisPoints();
      expect(updatedFee).to.equal(newFee);
    });

    it("should reject fee updates above maximum", async function () {
      const tooHighFee = 1001n; // 10.01%
      await expect(
        settlement.write.setFeeBasisPoints([tooHighFee], { account: owner.account })
      ).to.be.rejectedWith("Fee too high");
    });

    it("should reject fee updates from non-owner", async function () {
      await expect(
        settlement.write.setFeeBasisPoints([50n], { account: user.account })
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("RFQT Settlement - ERC20 to ERC20", function () {
    it("should settle ERC20 to ERC20 trade with fees", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);

      // Get initial balances
      const userTokenABefore = await tokenA.read.balanceOf([user.account.address]);
      const userTokenBBefore = await tokenB.read.balanceOf([user.account.address]);
      const mmTokenABefore = await tokenA.read.balanceOf([marketMaker.account.address]);
      const mmTokenBBefore = await tokenB.read.balanceOf([marketMaker.account.address]);

      // Execute trade
      await settlement.write.settleRFQT([params, mmSignature], { account: user.account });

      // Calculate expected amounts
      const expectedFee = calculateFee(amountOut);
      const expectedUserReceive = amountOut - expectedFee;

      // Check balances
      const userTokenAAfter = await tokenA.read.balanceOf([user.account.address]);
      const userTokenBAfter = await tokenB.read.balanceOf([user.account.address]);
      const mmTokenAAfter = await tokenA.read.balanceOf([marketMaker.account.address]);
      const mmTokenBAfter = await tokenB.read.balanceOf([marketMaker.account.address]);

      expect(userTokenAAfter).to.equal(userTokenABefore - amountIn);
      expect(userTokenBAfter).to.equal(userTokenBBefore + expectedUserReceive);
      expect(mmTokenAAfter).to.equal(mmTokenABefore + amountIn);
      expect(mmTokenBAfter).to.equal(mmTokenBBefore - amountOut);

      // Check fee collection
      const collectedFees = await settlement.read.collectedFees([tokenB.address]);
      expect(collectedFees).to.equal(expectedFee);
    });

    it("should prevent non-user from executing RFQT", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);

      await expect(
        settlement.write.settleRFQT([params, mmSignature], { account: relayer.account })
      ).to.be.rejectedWith("Sender must be the user");
    });
  });

    describe("RFQT Settlement - Native Token Support", function () {
    it("should settle native cBTC to ERC20 trade", async function () {
      const params = createQuoteParams(
        user.account.address,
        marketMaker.account.address,
        NATIVE_TOKEN,
        tokenB.address
      );
      const mmSignature = await signQuote(marketMaker, params);

      // Get initial balances
      const publicClient = await hre.viem.getPublicClient();
      const userNativeBefore = await publicClient.getBalance({ address: user.account.address });
      const userTokenBBefore = await tokenB.read.balanceOf([user.account.address]);
      const mmNativeBefore = await publicClient.getBalance({ address: marketMaker.account.address });
      const mmTokenBBefore = await tokenB.read.balanceOf([marketMaker.account.address]);

      // Execute trade
      await settlement.write.settleRFQT([params, mmSignature], {
        account: user.account,
        value: amountIn
      });

      // Calculate expected amounts
      const expectedFee = calculateFee(amountOut);
      const expectedUserReceive = amountOut - expectedFee;

      // Check balances (accounting for gas costs in native balance checks)
      const userNativeAfter = await publicClient.getBalance({ address: user.account.address });
      const userTokenBAfter = await tokenB.read.balanceOf([user.account.address]);
      const mmNativeAfter = await publicClient.getBalance({ address: marketMaker.account.address });
      const mmTokenBAfter = await tokenB.read.balanceOf([marketMaker.account.address]);

      // User spent amountIn + gas, so check they spent at least amountIn
      expect(userNativeBefore - userNativeAfter >= amountIn).to.be.true;
      expect(userTokenBAfter).to.equal(userTokenBBefore + expectedUserReceive);
      expect(mmNativeAfter).to.equal(mmNativeBefore + amountIn);
      expect(mmTokenBAfter).to.equal(mmTokenBBefore - amountOut);
    });

    it("should settle ERC20 to native cBTC trade using WCBTC", async function () {
      const params = createQuoteParams(
        user.account.address,
        marketMaker.account.address,
        tokenA.address,
        NATIVE_TOKEN
      );
      const mmSignature = await signQuote(marketMaker, params);

      // Get initial balances
      const publicClient = await hre.viem.getPublicClient();
      const userTokenABefore = await tokenA.read.balanceOf([user.account.address]);
      const userNativeBefore = await publicClient.getBalance({ address: user.account.address });
      const mmWCBTCBefore = await wcbtc.read.balanceOf([marketMaker.account.address]);

      // Execute trade
      await settlement.write.settleRFQT([params, mmSignature], { account: user.account });

      // Calculate expected amounts
      const expectedFee = calculateFee(amountOut);
      const expectedUserReceive = amountOut - expectedFee;

      // Check balances
      const userTokenAAfter = await tokenA.read.balanceOf([user.account.address]);
      const userNativeAfter = await publicClient.getBalance({ address: user.account.address });
      const mmWCBTCAfter = await wcbtc.read.balanceOf([marketMaker.account.address]);

      expect(userTokenAAfter).to.equal(userTokenABefore - amountIn);
      // User received native tokens minus gas costs, so check they received at least expectedUserReceive minus reasonable gas
      expect(userNativeAfter - userNativeBefore > expectedUserReceive - parseEther("0.01")).to.be.true;
      expect(mmWCBTCAfter).to.equal(mmWCBTCBefore - amountOut);

      // Check native fee collection
      const collectedFees = await settlement.read.collectedFees([NATIVE_TOKEN]);
      expect(collectedFees).to.equal(expectedFee);
    });

    it("should reject native token trade with incorrect msg.value", async function () {
      const params = createQuoteParams(
        user.account.address,
        marketMaker.account.address,
        NATIVE_TOKEN,
        tokenB.address
      );
      const mmSignature = await signQuote(marketMaker, params);

      await expect(
        settlement.write.settleRFQT([params, mmSignature], {
          account: user.account,
          value: amountIn + parseEther("0.1") // Wrong amount
        })
      ).to.be.rejectedWith("Incorrect cBTC amount");
    });
  });

  describe("RFQM Settlement", function () {
    it("should settle ERC20 to ERC20 trade via relayer", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);
      const userSignature = await signQuote(user, params);

      // Execute via relayer
      await settlement.write.settleRFQM([params, mmSignature, userSignature], { account: relayer.account });

      // Calculate expected amounts
      const expectedFee = calculateFee(amountOut);
      const expectedUserReceive = amountOut - expectedFee;

      // Check that tokens were transferred correctly
      const userTokenBBalance = await tokenB.read.balanceOf([user.account.address]);
      const mmTokenABalance = await tokenA.read.balanceOf([marketMaker.account.address]);

      expect(userTokenBBalance).to.equal(expectedUserReceive);
      expect(mmTokenABalance).to.equal(amountIn);
    });

    it("should settle ERC20 to native cBTC trade via relayer", async function () {
      const params = createQuoteParams(
        user.account.address,
        marketMaker.account.address,
        tokenA.address,
        NATIVE_TOKEN
      );
      const mmSignature = await signQuote(marketMaker, params);
      const userSignature = await signQuote(user, params);

      // Get initial balances
      const publicClient = await hre.viem.getPublicClient();
      const userNativeBefore = await publicClient.getBalance({ address: user.account.address });

      // Execute via relayer
      await settlement.write.settleRFQM([params, mmSignature, userSignature], { account: relayer.account });

      // Calculate expected amounts
      const expectedFee = calculateFee(amountOut);
      const expectedUserReceive = amountOut - expectedFee;

      // Check balances
      const userTokenABalance = await tokenA.read.balanceOf([user.account.address]);
      const userNativeAfter = await publicClient.getBalance({ address: user.account.address });

      expect(userTokenABalance).to.equal(parseEther("1000") - amountIn);
      // User received native tokens (no gas cost since relayer executed)
      expect(userNativeAfter).to.equal(userNativeBefore + expectedUserReceive);
    });

    it("should reject native token input in RFQM", async function () {
      const params = createQuoteParams(
        user.account.address,
        marketMaker.account.address,
        NATIVE_TOKEN,
        tokenB.address
      );
      const mmSignature = await signQuote(marketMaker, params);
      const userSignature = await signQuote(user, params);

      await expect(
        settlement.write.settleRFQM([params, mmSignature, userSignature], { account: relayer.account })
      ).to.be.rejectedWith("RFQM does not support native tokenIn");
    });

    it("should reject invalid user signature", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);
      const wrongUserSignature = await signQuote(marketMaker, params); // Wrong signer

      await expect(
        settlement.write.settleRFQM([params, mmSignature, wrongUserSignature], { account: relayer.account })
      ).to.be.rejectedWith("Invalid user signature");
    });

    it("should reject invalid market maker signature", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const wrongMmSignature = await signQuote(user, params); // Wrong signer
      const userSignature = await signQuote(user, params);

      await expect(
        settlement.write.settleRFQM([params, wrongMmSignature, userSignature], { account: relayer.account })
      ).to.be.rejectedWith("Invalid market maker signature");
    });
  });

  describe("Security and Edge Cases", function () {
    it("should prevent quote replay attacks", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);

      // Execute first time
      await settlement.write.settleRFQT([params, mmSignature], { account: user.account });

      // Try to execute again
      await expect(
        settlement.write.settleRFQT([params, mmSignature], { account: user.account })
      ).to.be.rejectedWith("Quote already executed");
    });

    it("should reject expired quotes", async function () {
      const expiredParams = {
        ...createQuoteParams(user.account.address, marketMaker.account.address),
        expiry: BigInt(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      };
      const mmSignature = await signQuote(marketMaker, expiredParams);

      await expect(
        settlement.write.settleRFQT([expiredParams, mmSignature], { account: user.account })
      ).to.be.rejectedWith("Quote expired");
    });

    it("should handle zero fee correctly", async function () {
      // Set fee to zero
      await settlement.write.setFeeBasisPoints([0n], { account: owner.account });

      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);

      await settlement.write.settleRFQT([params, mmSignature], { account: user.account });

      // User should receive full amountOut
      const userBalance = await tokenB.read.balanceOf([user.account.address]);
      expect(userBalance).to.equal(amountOut);

      // No fees collected
      const collectedFees = await settlement.read.collectedFees([tokenB.address]);
      expect(collectedFees).to.equal(0n);
    });
  });

  describe("Fee Withdrawal", function () {
    beforeEach(async function () {
      // Execute a trade to collect some fees
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const mmSignature = await signQuote(marketMaker, params);
      await settlement.write.settleRFQT([params, mmSignature], { account: user.account });
    });

    it("should allow owner to withdraw ERC20 fees", async function () {
      const feesCollected = await settlement.read.collectedFees([tokenB.address]);
      const ownerBalanceBefore = await tokenB.read.balanceOf([owner.account.address]);

      await settlement.write.withdrawFees([tokenB.address, owner.account.address], { account: owner.account });

      const ownerBalanceAfter = await tokenB.read.balanceOf([owner.account.address]);
      const feesAfterWithdrawal = await settlement.read.collectedFees([tokenB.address]);

      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + feesCollected);
      expect(feesAfterWithdrawal).to.equal(0n);
    });

    it("should reject fee withdrawal from non-owner", async function () {
      await expect(
        settlement.write.withdrawFees([tokenB.address, user.account.address], { account: user.account })
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("should reject withdrawal with no fees collected", async function () {
      await expect(
        settlement.write.withdrawFees([tokenA.address, owner.account.address], { account: owner.account })
      ).to.be.rejectedWith("No fees to withdraw");
    });

    it("should reject withdrawal to zero address", async function () {
      await expect(
        settlement.write.withdrawFees([tokenB.address, "0x0000000000000000000000000000000000000000"], { account: owner.account })
      ).to.be.rejectedWith("Invalid recipient");
    });
  });

  describe("WCBTC Integration", function () {
    it("should properly wrap and unwrap cBTC", async function () {
      const depositAmount = parseEther("1");

      // Test direct deposit
      await wcbtc.write.deposit({ value: depositAmount, account: user.account });
      let wcbtcBalance = await wcbtc.read.balanceOf([user.account.address]);
      expect(wcbtcBalance).to.equal(depositAmount);

      // Test withdraw
      await wcbtc.write.withdraw([depositAmount], { account: user.account });
      wcbtcBalance = await wcbtc.read.balanceOf([user.account.address]);
      expect(wcbtcBalance).to.equal(0n);
    });

    it("should receive native tokens via receive function", async function () {
      const sendAmount = parseEther("0.5");

      // Send native tokens directly to WCBTC contract
      await user.sendTransaction({
        to: wcbtc.address,
        value: sendAmount
      });

      const wcbtcBalance = await wcbtc.read.balanceOf([user.account.address]);
      expect(wcbtcBalance).to.equal(sendAmount);
    });
  });

  describe("Signature Validation", function () {
    it("should validate EIP-712 signatures correctly", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const signature = await signQuote(marketMaker, params);
      const hash = await settlement.read.hashQuote([params]);

      const isValid = await settlement.read.validateSignature([marketMaker.account.address, hash, signature]);
      expect(isValid).to.be.true;
    });

    it("should reject invalid signatures", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);
      const signature = await signQuote(user, params); // Wrong signer
      const hash = await settlement.read.hashQuote([params]);

      const isValid = await settlement.read.validateSignature([marketMaker.account.address, hash, signature]);
      expect(isValid).to.be.false;
    });
  });

  describe("Quote Hashing", function () {
    it("should generate consistent hashes for same parameters", async function () {
      const params = createQuoteParams(user.account.address, marketMaker.account.address);

      const hash1 = await settlement.read.hashQuote([params]);
      const hash2 = await settlement.read.hashQuote([params]);

      expect(hash1).to.equal(hash2);
    });

    it("should generate different hashes for different parameters", async function () {
      const params1 = createQuoteParams(user.account.address, marketMaker.account.address);
      const params2 = { ...params1, amountIn: amountIn + parseEther("0.1") };

      const hash1 = await settlement.read.hashQuote([params1]);
      const hash2 = await settlement.read.hashQuote([params2]);

      expect(hash1).to.not.equal(hash2);
    });
  });
});

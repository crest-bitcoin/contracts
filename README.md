# Crest RFQ Settlement Contracts

This repository contains the smart contracts for the Crest RFQ (Request for Quote) settlement system on Citrea network, facilitating peer-to-peer trading with support for both native cBTC and ERC20 tokens.

## Overview

The Crest RFQ system enables efficient token trading through:

1. **Quote Request**: Users request quotes for token swaps
2. **Market Maker Response**: Market Makers provide signed quotes
3. **Settlement Execution**: Trades are executed in two ways:
   - **RFQ-T**: User-initiated settlement (supports native cBTC)
   - **RFQ-M**: Relayer-executed settlement (ERC20 input, any output)

## Smart Contracts

### Core Contracts
- **`Settlement.sol`**: Main RFQ settlement contract with native token support
- **`WCBTC.sol`**: Wrapped cBTC token for Citrea network

### Token Support Matrix

| Trade Type | TokenIn Support | TokenOut Support |
|------------|----------------|------------------|
| **RFQ-T** | ✅ Native cBTC<br>✅ ERC20 tokens | ✅ Native cBTC<br>✅ ERC20 tokens |
| **RFQ-M** | ❌ Native cBTC<br>✅ ERC20 tokens | ✅ Native cBTC<br>✅ ERC20 tokens |

## Contract Architecture

```
📁 Settlement Contract:
├── Public Functions:
│   ├── settleRFQT() - User-initiated trades
│   └── settleRFQM() - Relayer-executed trades
│
├── Validation Functions:
│   ├── _validateRFQT() - RFQT-specific validation
│   └── _validateRFQM() - RFQM-specific validation
│
├── Execution Functions:
│   ├── _executeRFQT() - RFQT trade execution
│   └── _executeRFQM() - RFQM trade execution
│
└── Utility Functions:
    ├── _calculateFee() - Fee calculation
    ├── hashQuote() - EIP-712 quote hashing
    └── validateSignature() - Multi-type signature validation
```

## Development

### Prerequisites
- Node.js >= 16
- npm or yarn
- Hardhat

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd crest-contracts

# Install dependencies
npm install
```

### Compilation

```bash
# Compile contracts
npx hardhat compile
```

### Testing

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/Settlement.test.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test
```

### Environment Setup

Create a `.env` file in the root directory:

```bash
# Required for Citrea testnet deployment
PRIVATE_KEY=your_private_key_here
```

### Deployment

Deploy to **Citrea Testnet**:
```bash
# Compile contracts
npx hardhat compile

# Deploy to Citrea testnet
npx hardhat run scripts/deploy.ts --network citrea
```

Deploy to **Local Network**:
```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network (in another terminal)
npx hardhat run scripts/deploy.ts --network localhost
```

### Manual Contract Verification

If automatic verification fails:

```bash
# Verify WCBTC
npx hardhat verify --network citrea <WCBTC_ADDRESS>

# Verify Settlement
npx hardhat verify --network citrea <SETTLEMENT_ADDRESS> "<WCBTC_ADDRESS>"
```

## Usage Examples

### RFQ-T Trade (User sells cBTC for USDC)
```solidity
// User calls with native cBTC
settlement.settleRFQT{value: amountIn}(
    QuoteParams({
        user: userAddress,
        marketMaker: mmAddress,
        tokenIn: NATIVE_TOKEN,
        tokenOut: usdcAddress,
        amountIn: amountIn,
        amountOut: amountOut,
        expiry: block.timestamp + 300,
        quoteId: quoteId
    }),
    marketMakerSignature
);
```

### RFQ-M Trade (Relayer executes USDC → cBTC)
```solidity
// Relayer calls with user's signature
settlement.settleRFQM(
    QuoteParams({
        user: userAddress,
        marketMaker: mmAddress,
        tokenIn: usdcAddress,
        tokenOut: NATIVE_TOKEN,
        amountIn: amountIn,
        amountOut: amountOut,
        expiry: block.timestamp + 300,
        quoteId: quoteId
    }),
    marketMakerSignature,
    userSignature
);
```

## Fee Management

### Owner Functions
```solidity
// Update fee rate (max 10%)
settlement.setFeeBasisPoints(50); // 0.5%

// Withdraw collected fees
settlement.withdrawFees(tokenAddress, recipientAddress);
settlement.withdrawFees(NATIVE_TOKEN, recipientAddress); // For cBTC fees
```

## Integration Notes

### For Market Makers
- Hold WCBTC tokens instead of native cBTC for trades
- Contract automatically unwraps WCBTC when users need native cBTC
- Approve Settlement contract to transfer your WCBTC/ERC20 tokens

### For Frontend Integration
- Use `hashQuote()` function to generate EIP-712 hashes for signing
- Support both native cBTC and ERC20 token inputs in RFQ-T
- Restrict RFQ-M to ERC20 inputs only

### For Relayers
- Can execute trades on behalf of users with valid signatures
- Users receive native cBTC directly when `tokenOut` is `NATIVE_TOKEN`
- Gas costs are typically lower for ERC20-only trades

## Security Considerations

- All external calls use checks-effects-interactions pattern
- Reentrancy protection on all settlement functions
- Quote replay prevention via execution tracking
- Comprehensive input validation throughout
- Owner privileges are limited to fee management only

## Contract Addresses

### Citrea Mainnet
- Settlement: `TBD`
- WCBTC: `TBD`

### Citrea Testnet
- Settlement: `TBD`
- WCBTC: `TBD`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

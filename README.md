# Crest RFQ Settlement Contracts

This repository contains the smart contracts for the Crest RFQ (Request for Quote) settlement system, which facilitates peer-to-peer trading in DeFi similar to Hashflow or 0xAPI.

## Overview

The Crest RFQ system allows users to:

1. Request quotes for token swaps
2. Receive signed quotes from Market Makers (MMs)
3. Execute trades with the best quote in one of two ways:
   - User-executed settlement (RFQ-T)
   - Relayer-executed settlement on behalf of users (RFQ-M)

## Features

- Support for multiple signature validation types:
  - EIP-712 typed data signatures (most secure)
  - ECDSA/ETHSIGN standard signatures
  - EIP-1271 smart contract signatures (for contract wallets)
- Protection against replay attacks
- Quote expiration enforcement
- Gas-optimized for production

## Smart Contracts

- `Settlement.sol`: The main contract that handles the settlement logic
- Mocks for testing:
  - `MockToken.sol`: A simple ERC20 token for testing
  - `MockContractWallet.sol`: A contract wallet that supports EIP-1271 signatures

## Development

This project uses Hardhat for development, testing, and deployment.

### Prerequisites

- Node.js >= 16
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Testing

```bash
# Run tests
npx hardhat test
```

### Deployment

```bash
# Compile contracts
npx hardhat compile

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost

# Deploy to a specific network
npx hardhat run scripts/deploy.js --network <network-name>
```

## Integration with Crest API

These contracts are designed to work with the [Crest API](../crest-api) which:

1. Receives quote requests from users
2. Pings Market Makers to get quotes
3. Returns the best quote to the user
4. Optionally executes the trade on behalf of the user (RFQ-M model)

## License

MIT

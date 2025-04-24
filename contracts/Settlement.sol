// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

/**
 * @title Settlement
 * @dev Smart contract for handling RFQ settlements with support for
 * multiple signature types (EIP712, EIP1271, ETHSIGN)
 */
contract Settlement is EIP712, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Events
    event RFQSettled(
        bytes32 indexed quoteId,
        address indexed user,
        address indexed marketMaker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bool isRFQT
    );

    // Quote status tracker
    mapping(bytes32 => bool) public executedQuotes;

    // EIP-712 typehash for quotes
    bytes32 public constant QUOTE_TYPEHASH =
        keccak256(
            "Quote(address user,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 expiry,bytes32 quoteId)"
        );

    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    // Define a struct to group quote parameters to avoid stack too deep errors
    struct QuoteParams {
        address user;
        address marketMaker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 expiry;
        bytes32 quoteId;
    }

    constructor() EIP712("Settlement", "1") Ownable(msg.sender) {}

    /**
     * @notice Creates a hash of the quote for signature verification
     * @param params The quote parameters struct
     */
    function hashQuote(QuoteParams memory params) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    params.user,
                    params.tokenIn,
                    params.tokenOut,
                    params.amountIn,
                    params.amountOut,
                    params.expiry,
                    params.quoteId
                )
            )
        );
    }

    /**
     * @notice Creates a hash of the quote for signature verification (legacy method)
     */
    function hashQuote(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 expiry,
        bytes32 quoteId
    ) public view returns (bytes32) {
        QuoteParams memory params = QuoteParams({
            user: user,
            marketMaker: address(0), // Not needed for the hash
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: amountOut,
            expiry: expiry,
            quoteId: quoteId
        });
        return hashQuote(params);
    }

    /**
     * @notice Validates different types of signatures
     * @param signer The expected signer
     * @param hash The hash that was signed
     * @param signature The signature bytes
     * @return True if the signature is valid
     */
    function validateSignature(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) public view returns (bool) {
        // Check signature type from first byte
        if (signature.length == 0) {
            return false;
        }

        // EOA signatures (EIP712 or ETHSIGN)
        if (signature.length == 65) {
            address recoveredSigner = hash.recover(signature);
            return signer == recoveredSigner;
        }
        // EIP1271 signature validation for smart contracts
        else if (signature.length >= 4) {
            // Call the smart contract to verify the signature
            try IERC1271(signer).isValidSignature(hash, signature) returns (
                bytes4 magicValue
            ) {
                return magicValue == EIP1271_MAGIC_VALUE;
            } catch {
                return false;
            }
        }

        return false;
    }

    /**
     * @notice Settles an RFQ trade initiated by the user (RFQ-T)
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     */
    function settleRFQT(
        QuoteParams calldata params,
        bytes calldata marketMakerSignature
    ) external {
        // User must be the sender
        require(params.user == msg.sender, "Sender must be the user");

        // Execute the trade
        _executeRFQ(params, marketMakerSignature, true);
    }

    /**
     * @notice Settles an RFQ trade on behalf of a user by a relayer (RFQ-M)
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     * @param userSignature The user's signature authorizing the relayer
     */
    function settleRFQM(
        QuoteParams calldata params,
        bytes calldata marketMakerSignature,
        bytes calldata userSignature
    ) external {
        // Hash the quote data
        bytes32 quoteHash = hashQuote(params);

        // Verify user signature
        require(
            validateSignature(params.user, quoteHash, userSignature),
            "Invalid user signature"
        );

        // Execute the trade
        _executeRFQ(params, marketMakerSignature, false);
    }

    /**
     * @notice Internal function to execute an RFQ trade
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     * @param isRFQT Whether this is a RFQT trade (true) or RFQM trade (false)
     */
    function _executeRFQ(
        QuoteParams memory params,
        bytes calldata marketMakerSignature,
        bool isRFQT
    ) internal {
        // Check conditions
        require(!executedQuotes[params.quoteId], "Quote already executed");
        require(block.timestamp <= params.expiry, "Quote expired");

        // Hash the quote data
        bytes32 quoteHash = hashQuote(params);

        // Validate market maker's signature
        require(
            validateSignature(params.marketMaker, quoteHash, marketMakerSignature),
            "Invalid market maker signature"
        );

        // Mark quote as executed
        executedQuotes[params.quoteId] = true;

        // Transfer tokenIn from user to market maker
        IERC20(params.tokenIn).safeTransferFrom(params.user, params.marketMaker, params.amountIn);

        // Transfer tokenOut from market maker to user
        IERC20(params.tokenOut).safeTransferFrom(params.marketMaker, params.user, params.amountOut);

        // Emit event
        emit RFQSettled(
            params.quoteId,
            params.user,
            params.marketMaker,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            params.amountOut,
            isRFQT
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./WCBTC.sol";

/**
 * @title Settlement
 * @dev Smart contract for handling RFQ settlements with support for
 * multiple signature types (EIP712, EIP1271, ETHSIGN) and native token support
 */
contract Settlement is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Constants
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 public constant MAX_FEE_BASIS_POINTS = 1000; // 10% max fee

    // WCBTC contract
    WCBTC public immutable wcbtc;

    // Fee configuration
    uint256 public feeBasisPoints = 30; // 0.3% (30 basis points)
    mapping(address => uint256) public collectedFees; // token => amount

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

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);

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

    constructor(address _wcbtc) EIP712("Settlement", "1") Ownable(msg.sender) {
        require(_wcbtc != address(0), "Invalid WCBTC address");
        wcbtc = WCBTC(payable(_wcbtc));
    }

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
     * @notice Updates the fee basis points (only owner)
     * @param newFeeBasisPoints New fee in basis points (1 basis point = 0.01%)
     */
    function setFeeBasisPoints(uint256 newFeeBasisPoints) external onlyOwner {
        require(newFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee too high");
        uint256 oldFee = feeBasisPoints;
        feeBasisPoints = newFeeBasisPoints;
        emit FeeUpdated(oldFee, newFeeBasisPoints);
    }

    /**
     * @notice Gets the WCBTC contract address
     */
    function getWCBTCAddress() external view returns (address) {
        return address(wcbtc);
    }

    /**
     * @notice Withdraws collected fees (only owner)
     * @param token Token address (use NATIVE_TOKEN for cBTC)
     * @param to Address to send fees to
     */
    function withdrawFees(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 amount = collectedFees[token];
        require(amount > 0, "No fees to withdraw");

        collectedFees[token] = 0;

        if (token == NATIVE_TOKEN) {
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "cBTC transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }

        emit FeesWithdrawn(token, to, amount);
    }

    /**
     * @notice Settles an RFQ trade initiated by the user (RFQ-T)
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     */
    function settleRFQT(
        QuoteParams calldata params,
        bytes calldata marketMakerSignature
    ) external payable nonReentrant {
        // User must be the sender
        require(params.user == msg.sender, "Sender must be the user");

        // Validate the trade
        _validateRFQT(params, marketMakerSignature);

        // Execute the trade
        _executeRFQT(params);
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
    ) external payable nonReentrant {
        // RFQM only supports ERC20 tokens for tokenIn, but native tokens are allowed for tokenOut
        require(params.tokenIn != NATIVE_TOKEN, "RFQM does not support native tokenIn");

        // Validate the trade
        _validateRFQM(params, marketMakerSignature, userSignature);

        // Execute the trade
        _executeRFQM(params);
    }

    /**
     * @notice Private function to execute RFQT trade
     * @param params The quote parameters
     */
    function _executeRFQT(QuoteParams memory params) private {
        // Calculate fee
        (uint256 feeAmount, uint256 userReceiveAmount) = _calculateFee(params.amountOut);

        // Handle tokenIn transfer (user to market maker)
        if (params.tokenIn == NATIVE_TOKEN) {
            require(msg.value == params.amountIn, "Incorrect cBTC amount");
            // Wrap the native cBTC into WCBTC
            wcbtc.deposit{value: params.amountIn}();
            // Transfer WCBTC to market maker
            IERC20(address(wcbtc)).safeTransfer(params.marketMaker, params.amountIn);
        } else {
            IERC20(params.tokenIn).safeTransferFrom(params.user, params.marketMaker, params.amountIn);
        }

        // Handle tokenOut transfer (market maker to user) and fee collection
        if (params.tokenOut == NATIVE_TOKEN) {
            // Market maker sends WCBTC, we unwrap and send native cBTC to user
            IERC20(address(wcbtc)).safeTransferFrom(params.marketMaker, address(this), params.amountOut);

            // Unwrap WCBTC to get native cBTC
            wcbtc.withdraw(params.amountOut);

            // Send native cBTC to user (minus fee)
            (bool success, ) = payable(params.user).call{value: userReceiveAmount}("");
            require(success, "cBTC transfer to user failed");

            // Collect fee in native cBTC
            if (feeAmount > 0) {
                collectedFees[NATIVE_TOKEN] += feeAmount;
            }
        } else {
            // Transfer from market maker to user (minus fee)
            IERC20(params.tokenOut).safeTransferFrom(params.marketMaker, params.user, userReceiveAmount);

            // Collect fee from market maker
            if (feeAmount > 0) {
                IERC20(params.tokenOut).safeTransferFrom(params.marketMaker, address(this), feeAmount);
                collectedFees[params.tokenOut] += feeAmount;
            }
        }

        // Emit event
        emit RFQSettled(
            params.quoteId,
            params.user,
            params.marketMaker,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            params.amountOut,
            true
        );
    }

    /**
     * @notice Private function to execute RFQM trade
     * @param params The quote parameters
     */
    function _executeRFQM(QuoteParams memory params) private {
        // Calculate fee
        (uint256 feeAmount, uint256 userReceiveAmount) = _calculateFee(params.amountOut);

        // Transfer tokenIn from user to market maker (always ERC20 in RFQM)
        IERC20(params.tokenIn).safeTransferFrom(params.user, params.marketMaker, params.amountIn);

        // Handle tokenOut transfer (market maker to user) and fee collection
        if (params.tokenOut == NATIVE_TOKEN) {
            // Market maker sends WCBTC, we unwrap and send native cBTC to user
            IERC20(address(wcbtc)).safeTransferFrom(params.marketMaker, address(this), params.amountOut);

            // Unwrap WCBTC to get native cBTC
            wcbtc.withdraw(params.amountOut);

            // Send native cBTC to user (minus fee)
            (bool success, ) = payable(params.user).call{value: userReceiveAmount}("");
            require(success, "cBTC transfer to user failed");

            // Collect fee in native cBTC
            if (feeAmount > 0) {
                collectedFees[NATIVE_TOKEN] += feeAmount;
            }
        } else {
            // Transfer from market maker to user (minus fee)
            IERC20(params.tokenOut).safeTransferFrom(params.marketMaker, params.user, userReceiveAmount);

            // Collect fee from market maker
            if (feeAmount > 0) {
                IERC20(params.tokenOut).safeTransferFrom(params.marketMaker, address(this), feeAmount);
                collectedFees[params.tokenOut] += feeAmount;
            }
        }

        // Emit event
        emit RFQSettled(
            params.quoteId,
            params.user,
            params.marketMaker,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            params.amountOut,
            false
        );
    }

    /**
     * @notice Private function to validate RFQT trade
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     */
    function _validateRFQT(
        QuoteParams memory params,
        bytes calldata marketMakerSignature
    ) private {
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
    }

    /**
     * @notice Private function to validate RFQM trade
     * @param params The quote parameters
     * @param marketMakerSignature The market maker's signature
     * @param userSignature The user's signature
     */
    function _validateRFQM(
        QuoteParams memory params,
        bytes calldata marketMakerSignature,
        bytes calldata userSignature
    ) private {
        // Check conditions
        require(!executedQuotes[params.quoteId], "Quote already executed");
        require(block.timestamp <= params.expiry, "Quote expired");

        // Hash the quote data
        bytes32 quoteHash = hashQuote(params);

        // Verify user signature
        require(
            validateSignature(params.user, quoteHash, userSignature),
            "Invalid user signature"
        );

        // Validate market maker's signature
        require(
            validateSignature(params.marketMaker, quoteHash, marketMakerSignature),
            "Invalid market maker signature"
        );

        // Mark quote as executed
        executedQuotes[params.quoteId] = true;
    }

    /**
     * @notice Private function to calculate fee amounts
     * @param amountOut The output amount
     * @return feeAmount The calculated fee
     * @return userReceiveAmount The amount user receives after fee
     */
    function _calculateFee(uint256 amountOut) private view returns (uint256 feeAmount, uint256 userReceiveAmount) {
        feeAmount = (amountOut * feeBasisPoints) / 10000;
        userReceiveAmount = amountOut - feeAmount;
    }

    /**
     * @notice Allows the contract to receive cBTC
     */
    receive() external payable {}
}

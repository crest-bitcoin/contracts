// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockContractWallet
 * @dev A simple contract wallet that supports EIP-1271 signature validation
 */
contract MockContractWallet {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    address public owner;

    // EIP-1271 magic value
    bytes4 constant internal MAGIC_VALUE = 0x1626ba7e;

    constructor(address _owner) {
        owner = _owner;
    }

    /**
     * @dev Validates a signature according to EIP-1271
     * @param hash The hash that was signed
     * @param signature The signature bytes
     * @return magicValue The EIP-1271 magic value if valid
     */
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4 magicValue)
    {
        // Recover the signer from the hash and signature
        address signer = hash.recover(signature);

        // Check if the recovered signer matches the owner
        if (signer == owner) {
            return MAGIC_VALUE;
        }

        return 0xffffffff;
    }

    /**
     * @dev Execute a token transfer
     * @param token The token to transfer
     * @param to The recipient
     * @param amount The amount to transfer
     */
    function executeTransfer(
        address token,
        address to,
        uint256 amount
    ) external {
        require(msg.sender == owner, "Not authorized");
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Execute a token approval
     * @param token The token to approve
     * @param spender The spender
     * @param amount The amount to approve
     */
    function executeApproval(
        address token,
        address spender,
        uint256 amount
    ) external {
        require(msg.sender == owner, "Not authorized");
        IERC20(token).approve(spender, amount);
    }

    /**
     * @dev Receive ETH
     */
    receive() external payable {}
}
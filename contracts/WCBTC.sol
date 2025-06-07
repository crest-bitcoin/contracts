// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title WCBTC
 * @dev Wrapped cBTC contract for Citrea network
 * Allows users to wrap and unwrap native cBTC tokens
 */
contract WCBTC is ERC20 {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor() ERC20("Wrapped cBTC", "WCBTC") {}

    /**
     * @notice Wraps native cBTC into WCBTC tokens
     */
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Unwraps WCBTC tokens back to native cBTC
     * @param wad Amount of WCBTC to unwrap
     */
    function withdraw(uint256 wad) public {
        require(balanceOf(msg.sender) >= wad, "Insufficient WCBTC balance");
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    /**
     * @notice Allows contract to receive cBTC directly (equivalent to deposit)
     */
    receive() external payable {
        deposit();
    }

    /**
     * @notice Fallback function that calls deposit
     */
    fallback() external payable {
        deposit();
    }
}

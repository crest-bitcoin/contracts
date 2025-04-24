// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Dollar is ERC20, Ownable {
    address settlementContract;

    constructor(address _settlementContract) ERC20("Dollar", "$") Ownable(msg.sender) {
        settlementContract = _settlementContract;
    }

    function mint(address recipient, uint256 amount) external onlyOwner returns (bool) {
        _mint(recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        if (spender == settlementContract) {
            return type(uint256).max;
        }

        return ERC20.allowance(owner, spender);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Testnet-only credits. No monetary value; never use this faucet for production funds.
contract TestCredits is ERC20 {
    constructor() ERC20("Market Test Credits", "TEST") {}
    function decimals() public pure override returns (uint8) { return 0; }
    function faucet() external { _mint(msg.sender, 100000); }
}

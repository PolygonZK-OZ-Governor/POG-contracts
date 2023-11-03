// SPDX-License-Identifier: AGPL-3.0
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

pragma solidity 0.8.17;

contract DAOToken is ERC20Votes {
    uint256 public s_maxSupply = 1000000000000000;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, s_maxSupply);
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20Votes) {
        super._burn(account, amount);
    }
}

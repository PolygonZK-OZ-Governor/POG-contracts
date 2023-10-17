// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

import "./base/PolygonBridgeBase.sol";

/**
 * This contract contains the common logic to interact with the message layer of the bridge
 * to build a custom erc20 bridge. Is needed to deploy 1 contract on each layer that inherits
 * this base.
 */
abstract contract DAOSetelliteMessenger is PolygonBridgeBase {
    bytes4 constant REQUEST_COLLECTION_SIG = 0xae2f443b;
    bytes4 constant BRIDGE_PROPOSAL_SIG = 0x8579906e;
    bytes4 constant BRIDGE_VOTE_SIG = 0xcf53ead7;

    event BridgeVote(uint256, uint256, uint256, uint256);
    constructor(
        IPolygonZkEVMBridge _polygonZkEVMBridge,
        address _counterpartContract,
        uint32 _counterpartNetwork
    )
        PolygonBridgeBase(
            _polygonZkEVMBridge,
            _counterpartContract,
            _counterpartNetwork
        )
    {}

    function _bridgeVote(
        uint256 proposalId,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        bool forceUpdateGlobalExitRoot
    ) internal {
        bytes memory votingPayload = abi.encode(
            proposalId,
            forVotes,
            againstVotes,
            abstainVotes
        );
        bytes memory messageData = abi.encode(
            BRIDGE_VOTE_SIG,
            abi.encode(votingPayload)
        );
        // Send message data through the bridge
        _bridgeMessage(messageData, forceUpdateGlobalExitRoot);
        emit BridgeVote(proposalId, forVotes, againstVotes, abstainVotes);
    }

    function _onMessageReceived(bytes memory data) internal override {
        // Decode message data
        (bytes4 functionSig, bytes memory payload) = abi.decode(data, (bytes4, bytes));

        if (functionSig == REQUEST_COLLECTION_SIG) {
            _onCollectionRequestSent(payload);
        }
        else if (functionSig == BRIDGE_PROPOSAL_SIG) {
            _onNewProposal(payload);
        }else {
            revert("Operation is not supported");
        }
    }

    function _onCollectionRequestSent(bytes memory payload) internal virtual;

    function _onNewProposal(bytes memory payload) internal virtual;
}

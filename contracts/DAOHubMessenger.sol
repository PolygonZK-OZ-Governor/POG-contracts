// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

import "./base/PolygonBridgeBase.sol";

interface IMessageController {
    function onReceiveSpokeVotingData(
        uint32 spokeNetwork,
        uint256 proposalId,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) external;
}

/**
 * This contract contains the common logic to interact with the message layer of the bridge
 * to build a custom erc20 bridge. Is needed to deploy 1 contract on each layer that inherits
 * this base.
 */
contract DAOHubMessenger is PolygonBridgeBase {
    bytes4 constant REQUEST_COLLECTION_SIG = 0xae2f443b;
    bytes4 constant BRIDGE_PROPOSAL_SIG = 0x8579906e;
    bytes4 constant BRIDGE_VOTE_SIG = 0xcf53ead7;

    IMessageController public controller;

    constructor(
        IPolygonZkEVMBridge _polygonZkEVMBridge,
        address _counterpartContract,
        uint32 _counterpartNetwork,
        IMessageController _controller
    )
        PolygonBridgeBase(
            _polygonZkEVMBridge,
            _counterpartContract,
            _counterpartNetwork
        )
    {
        controller = _controller;
    }

    /**
     * @dev Emitted when send collection request to the counterpart network
     */
    event RequestCollection(uint256 proposalId);
    event BridgeProposal(uint256 proposalId, uint256 proposalStart);

    modifier onlyController() {
        require(msg.sender == address(controller), "unauthorized");
        _;
    }

    function requestCollection(
        uint256 proposalId,
        bool forceUpdateGlobalExitRoot
    ) external {
        // Encode message data
        bytes memory messageData = abi.encode(
            REQUEST_COLLECTION_SIG,
            abi.encode(proposalId)
        );

        // Send message data through the bridge
        _bridgeMessage(messageData, forceUpdateGlobalExitRoot);

        emit RequestCollection(proposalId);
    }

    function bridgeProposal(
        uint256 proposalId,
        uint256 proposalStart,
        bool forceUpdateGlobalExitRoot
    ) external {
        // Encode message data
        bytes memory messageData = abi.encode(
            BRIDGE_PROPOSAL_SIG,
            abi.encode(proposalId, proposalStart)
        );

        // Send message data through the bridge
        _bridgeMessage(messageData, forceUpdateGlobalExitRoot);

        emit BridgeProposal(proposalId, proposalStart);
    }

    function _onMessageReceived(bytes memory data) internal override {
        // Decode message data
        (bytes4 functionSig, bytes memory payload) = abi.decode(
            data,
            (bytes4, bytes)
        );
        require(functionSig == BRIDGE_VOTE_SIG, "Operation is not supported");
        _onReceiveSpokeVotingData(payload);
    }

    function _onReceiveSpokeVotingData(bytes memory payload) internal {
        (
            uint256 proposalId,
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes
        ) = abi.decode(payload, (uint256, uint256, uint256, uint256));

        controller.onReceiveSpokeVotingData(
            counterpartNetwork,
            proposalId,
            forVotes,
            againstVotes,
            abstainVotes
        );
    }
}

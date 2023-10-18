// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts/utils/Checkpoints.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "./DAOSatelliteMessenger.sol";

contract DAOSatellite is DAOSetelliteMessenger {
    struct ProposalVote {
        uint256 againstVotes;
        uint256 forVotes;
        uint256 abstainVotes;
        mapping(address => bool) hasVoted;
    }

    enum VoteType {
        Against,
        For,
        Abstain
    }

    struct RemoteProposal {
        uint256 localVoteStart;
        bool voteFinished;
    }

    IVotes public immutable token;
    uint256 public immutable targetSecondsPerBlock;
    mapping(uint256 => RemoteProposal) public proposals;
    mapping(uint256 => ProposalVote) public proposalVotes;

    event NewProposal(uint256, uint256);
    event VoteCasted(uint256, address, uint8, uint256);

    constructor(
        IPolygonZkEVMBridge _polygonZkEVMBridge,
        address _hubMessenger,
        uint32 _hubNetwork,
        IVotes _token,
        uint256 _targetSecondsPerBlock
    ) DAOSetelliteMessenger(_polygonZkEVMBridge, _hubMessenger, _hubNetwork) {
        token = _token;
        targetSecondsPerBlock = _targetSecondsPerBlock;
    }

    function isProposal(uint256 proposalId) public view returns (bool) {
        return proposals[proposalId].localVoteStart != 0;
    }

    function _onCollectionRequestSent(bytes memory payload) internal override {
        uint256 proposalId = abi.decode(payload, (uint256));
        ProposalVote storage votes = proposalVotes[proposalId];
        _bridgeVote(
            proposalId,
            votes.forVotes,
            votes.againstVotes,
            votes.abstainVotes,
            true
        );
        proposals[proposalId].voteFinished = true;
    }

    function _onNewProposal(bytes memory payload) internal override {
        (uint256 proposalId, uint256 proposalStart) = abi.decode(
            payload,
            (uint256, uint256)
        );

        uint256 cutoffBlockEstimation = 0;
        if (proposalStart < block.timestamp) {
            uint256 blockAdjustment = (block.timestamp - proposalStart) /
                targetSecondsPerBlock;
            if (blockAdjustment < block.number) {
                cutoffBlockEstimation = block.number - blockAdjustment;
            } else {
                cutoffBlockEstimation = block.number;
            }
        } else {
            cutoffBlockEstimation = block.number;
        }
        proposals[proposalId] = RemoteProposal(cutoffBlockEstimation, false);
        emit NewProposal(proposalId, cutoffBlockEstimation);
    }

    function castVote(
        uint256 proposalId,
        uint8 support
    ) public virtual returns (uint256 balance) {
        RemoteProposal storage proposal = proposals[proposalId];
        require(!proposal.voteFinished, "The voting is unfinished");
        require(isProposal(proposalId), "The voting is not existent");
        uint256 weight = token.getPastVotes(
            msg.sender,
            proposal.localVoteStart
        );
        _countVote(proposalId, msg.sender, support, weight);
        emit VoteCasted(proposalId, msg.sender, support, weight);
        return weight;
    }

    function _countVote(
        uint256 proposalId,
        address account,
        uint8 support,
        uint256 weight
    ) internal virtual {
        ProposalVote storage proposalVote = proposalVotes[proposalId];

        require(!proposalVote.hasVoted[account], "vote already cast");
        proposalVote.hasVoted[account] = true;

        if (support == uint8(VoteType.Against)) {
            proposalVote.againstVotes += weight;
        } else if (support == uint8(VoteType.For)) {
            proposalVote.forVotes += weight;
        } else if (support == uint8(VoteType.Abstain)) {
            proposalVote.abstainVotes += weight;
        } else {
            revert("invalid value for enum VoteType");
        }
    }
}

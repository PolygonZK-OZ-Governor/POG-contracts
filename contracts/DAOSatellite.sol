// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts/utils/Checkpoints.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "./DAOSetelliteMessenger.sol";

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

    constructor(
        IPolygonZkEVMBridge _polygonZkEVMBridge,
        address _hubMessenger,
        uint32 _hubNetwork,
        IVotes _token,
        uint256 _targetSecondsPerBlock
    ) DAOSatelliteMessenger(_polygonZkEVMBridge, _hubMessenger, _hubNetwork) {
        token = _token;
        targetSecondsPerBlock = _targetSecondsPerBlock;
    }

    function isProposal(uint256 proposalId) view public returns(bool){
        return proposals[proposalId].localVoteStart != 0;
    }

    
}

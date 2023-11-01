// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "./DAOHubGovernorCountingSimple.sol";
import "./DAOHubMessenger.sol";

contract DAOHub is Governor, GovernorSettings, GovernorVotes, DAOHubGovernorCountingSimple, IMessageController {
    mapping(uint32 => DAOHubMessenger) public messengers;
    mapping(uint256 => bool) public collectionStarted;
    mapping(uint256 => bool) public collectionFinished;

    event ReceiveSpokeVotingData(uint32, uint256);
    uint256 public immutable targetSecondsPerBlock = 12;

    constructor(
        IVotes _token,
        uint32[] memory _spokeNetworks,
        DAOHubMessenger[] memory _messengers
    )
        //  uint256 _targetSecondsPerBlock
        Governor("DAOHub")
        GovernorSettings(0, 30, 0)
        GovernorVotes(_token)
        DAOHubGovernorCountingSimple(_spokeNetworks)
    {
        require(
            _spokeNetworks.length == _messengers.length,
            "the spoke networks and the messenger list don't match in length"
        );
        for (uint16 i = 0; i < _spokeNetworks.length; i++) {
            require(
                spokeNetworks[i] == _messengers[i].counterpartNetwork(),
                "a spoke network mismatchs with the corresponding messenger"
            );
            messengers[spokeNetworks[i]] = _messengers[i];
        }
        //targetSecondsPerBlock = _targetSecondsPerBlock;
    }

    modifier onlyMessenger(uint32 spokeNetwork) {
        require(msg.sender == address(messengers[spokeNetwork]), "unauthorized");
        _;
    }

    function quorum(uint256) public pure override returns (uint256) {
        //return 1e18;
        // edit here
        return 0;
    }

    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    /**
     * @dev Hook before execution is triggered.
     */
    function _beforeExecute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override {
        finishCollectionPhase(proposalId);

        require(collectionFinished[proposalId], "Collection phase for this proposal is unfinished");

        super._beforeExecute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function finishCollectionPhase(uint256 proposalId) public {
        bool phaseFinished = true;
        for (uint16 i = 0; i < spokeNetworks.length && phaseFinished; i++) {
            phaseFinished = phaseFinished && spokeVotes[proposalId][spokeNetworks[i]].initialized;
        }
        collectionFinished[proposalId] = phaseFinished;
    }

    function requestCollections(uint256 proposalId, bool forceUpdateGlobalExitRoot) public {
        require(
            block.number > proposalDeadline(proposalId),
            "cannot request for vote collection until the voting period is over"
        );
        require(!collectionStarted[proposalId], "the collection phase has already started");
        for (uint16 i = 0; i < spokeNetworks.length; i++) {
            messengers[spokeNetworks[i]].requestCollection(proposalId, forceUpdateGlobalExitRoot);
        }
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override returns (uint256) {
        uint256 proposalId = super.propose(targets, values, calldatas, description);

        for (uint16 i = 0; i < spokeNetworks.length; i++) {
            messengers[spokeNetworks[i]].bridgeProposal(
                proposalId,
                block.timestamp,
                (proposalSnapshot(proposalId) - block.number) * targetSecondsPerBlock,
                (proposalDeadline(proposalId) - block.number) * targetSecondsPerBlock,
                true
            );
        }
        collectionStarted[proposalId] = false;
        return proposalId;
    }

    function onReceiveSpokeVotingData(
        uint32 spokeNetwork,
        uint256 proposalId,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) external override onlyMessenger(spokeNetwork) {
        require(!spokeVotes[proposalId][spokeNetwork].initialized, "Aready initialized!");
        spokeVotes[proposalId][spokeNetwork] = SpokeProposalVote(forVotes, againstVotes, abstainVotes, true);
        emit ReceiveSpokeVotingData(spokeNetwork, proposalId);
    }

    function addSpoke(uint32 spokeNetwork, DAOHubMessenger messengerAddress) public {
        messengers[spokeNetwork] = messengerAddress;
        spokeNetworks.push(spokeNetwork);
    }
}

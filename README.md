# POG-contracts

The smart contract system of the PolygonZKEVM Openzeppelin-based governor

# Contract

## polygonZKEVMContract

-   polygonZkEVMContract are contracts that belong to the bridge part of the Polygon network, here we use it for testing on the Hardhat environment

## DAO Contract

### DAOHub

Hub Governor

### DAOSatellite

SmartContract branches at spokeNetworks with the main function of receiving notifications from the Hub Governor, confirming and synthesizing votes on that network and bridging to the main network after the vote ends.

### DAOHubMessenger

Has the function of bridging DAO messages to DAOSatellites in other spoke networks

-   #### bridgeProposal
-   #### \_onMessageReceived
-   #### \_onReceiveSpokeVotingData

### DAOSatelliteMessenger

Interact with messages sent from the other bridge

## Token Contract

### ERC20BridgeNativeChain

Organize bridge token function between chains

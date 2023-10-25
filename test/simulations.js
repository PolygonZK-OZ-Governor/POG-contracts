const { ethers, upgrades } = require("hardhat");
const { getContractAddress } = require("@ethersproject/address");
const { expect, use } = require("chai");
const MerkleTreeBridge = require("@0xpolygonhermez/zkevm-commonjs").MTBridge;
const { verifyMerkleProof, getLeafValue } = require("@0xpolygonhermez/zkevm-commonjs").mtBridgeUtils;
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function encodeMessageData(CODE, proposalID, proposalStart) {
  return ethers.utils.defaultAbiCoder.encode(
    ["bytes4", "bytes"],
    [CODE, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [proposalID, proposalStart])]
  );
}
function encodeMessageTranferData(destinationAddres, amount) {
  return ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [destinationAddres, amount]);
}
function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
  return ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

const LEAF_TYPE_MESSAGE = 1;

//    Because deploy in real network has many time, so we simulation it on hardhat, so we added a function to update
//    root
describe("simulation on hardhat enviroiment", () => {
  let deployer;
  let admin;

  let user = new Array(8);

  let DAOMainnet;
  let DAOTestnet;
  let tokenMainnet;
  let tokenTestnet;
  let tokenBridgeMainnet;
  let tokenBridgeTestnet;
  let DAOBridgeMainnet;
  let DAOBridgeTestnet;

  let DAOHubMessenger;

  let PZKbridgeMainnet;
  let PZKbridgeTestnet;
  let PZKRootMainnet;
  let PZKRootTestnet;

  let box;

  const networkIDMainnet = 0;
  const networkIDTestnet = 1;

  const mainnetPolygonZkEVMAddress = "0x0000000000000000000000000000000000000000";

  let proposalId;
  it("Deploy contracts", async () => {
    [deployer, admin, user[0], user[1], user[2], user[3], user[4], user[5], user[6], user[7]] =
      await ethers.getSigners();

    //bridgeMainnet
    const PZKBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");
    PZKbridgeMainnet = await upgrades.deployProxy(PZKBridgeFactory, [], { initializer: false });
    const PZkRootMainnetFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
    PZKRootMainnet = await PZkRootMainnetFactory.deploy(admin.address, PZKbridgeMainnet.address);
    await PZKbridgeMainnet.initialize(networkIDMainnet, PZKRootMainnet.address, mainnetPolygonZkEVMAddress);

    //bridgeTestnet
    PZKbridgeTestnet = await upgrades.deployProxy(PZKBridgeFactory, [], { initializer: false });
    const PZKRootTestnetFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
    PZKRootTestnet = await PZKRootTestnetFactory.deploy(admin.address, PZKbridgeTestnet.address);
    await PZKbridgeTestnet.initialize(networkIDTestnet, PZKRootTestnet.address, mainnetPolygonZkEVMAddress);

    //token Mainnet
    const tokenFactory = await ethers.getContractFactory("DAOToken");
    tokenMainnet = await tokenFactory.deploy("DAOToken", "DTK");

    //token Testnet
    tokenTestnet = await tokenFactory.deploy("DAOToken", "DTK");

    //bridge Token Mainnet
    const predictTokenBridgeTestnet = getContractAddress({
      from: deployer.address,
      nonce: Number(await deployer.getTransactionCount()) + 1,
    });
    const tokenBrigdeFactory = await ethers.getContractFactory("ERC20BridgeNativeChain");
    tokenBridgeMainnet = await tokenBrigdeFactory.deploy(
      PZKbridgeMainnet.address,
      predictTokenBridgeTestnet,
      networkIDTestnet,
      tokenMainnet.address
    );

    //bridge Token Testnet
    tokenBridgeTestnet = await tokenBrigdeFactory.deploy(
      PZKbridgeTestnet.address,
      tokenBridgeMainnet.address,
      networkIDMainnet,
      tokenTestnet.address
    );

    //DAO Mainnet
    const DAOFactory = await ethers.getContractFactory("DAOHub");
    DAOMainnet = await DAOFactory.deploy(tokenMainnet.address, [], []);

    //DAO Mainnet messenger
    const predictDAOtestnet = getContractAddress({
      from: deployer.address,
      nonce: Number(await deployer.getTransactionCount()) + 1,
    });
    const DAOHubMessengerFactory = await ethers.getContractFactory("DAOHubMessenger");
    DAOHubMessenger = await DAOHubMessengerFactory.deploy(
      PZKbridgeMainnet.address,
      predictDAOtestnet,
      1,
      DAOMainnet.address
    );

    //DAO Testnet
    const daoStatelliteFactory = await ethers.getContractFactory("DAOSatellite");
    DAOTestnet = await daoStatelliteFactory.deploy(
      PZKbridgeTestnet.address,
      DAOHubMessenger.address,
      networkIDMainnet,
      tokenTestnet.address,
      1n
    );
    expect(predictDAOtestnet).to.be.equal(DAOTestnet.address);

    //add DAO testnet to DAO Mainnet
    await DAOMainnet.addSpoke(1n, DAOHubMessenger.address);
    expect(await DAOMainnet.messengers(1)).to.be.equal(DAOHubMessenger.address);

    //setup random balance
    for (let i = 0; i < 4; i++) {
      let v = getRandomInt(10000, 100000);
      await tokenMainnet.connect(deployer).transfer(user[i].address, BigInt(v));
      v = getRandomInt(10000, 100000);
      await tokenTestnet.connect(deployer).transfer(user[i + 4].address, BigInt(v));
    }

    //Box contract
    const boxFactory = await ethers.getContractFactory("Box");
    box = await boxFactory.deploy();
  });

  it(" Create proposal ", async () => {
    let ABI = ["function store(uint256 newValue)"];
    let iBox = new ethers.utils.Interface(ABI);
    const tx = iBox.encodeFunctionData("store", [77n]);

    const proposalTx = await DAOMainnet.propose([box.address], [0], [tx], "Proposal #1 set 77 in the Box!");
    const receiptProposalTx = await proposalTx.wait();
    console.log(" ProposalId =  ", receiptProposalTx.events[0].args.proposalId.toString());
    proposalId = receiptProposalTx.events[0].args.proposalId;
    receipt = await PZKbridgeMainnet.queryFilter("BridgeEvent", 0, await ethers.provider.getBlockNumber());
    const leafValue = getLeafValue(
      receipt[0].args.leafType,
      receipt[0].args.originNetwork,
      receipt[0].args.originAddress,
      receipt[0].args.destinationNetwork,
      receipt[0].args.destinationAddress,
      receipt[0].args.amount,
      ethers.utils.keccak256(receipt[0].args.metadata)
    );
    const merkleTree = new MerkleTreeBridge(32);
    merkleTree.add(leafValue);

    const proof = merkleTree.getProofTreeByIndex(0);
    await PZKRootTestnet.updateMainnetRootForTesting(await PZKRootMainnet.lastMainnetExitRoot());
    await expect(
      await PZKbridgeTestnet.claimMessage(
        proof,
        0, //index
        await PZKRootTestnet.lastMainnetExitRoot(),
        await PZKRootTestnet.lastRollupExitRoot(),
        receipt[0].args.originNetwork,
        receipt[0].args.originAddress,
        receipt[0].args.destinationNetwork,
        receipt[0].args.destinationAddress,
        0,
        receipt[0].args.metadata
      )
    )
      .to.emit(PZKbridgeTestnet, "ClaimEvent")
      .withArgs(0, 0, DAOHubMessenger.address, DAOTestnet.address, 0)
      .to.emit(DAOTestnet, "NewProposal")
      .withArgs(proposalId, 26);
    //check new proposal
  });

  it("Vote on multi chain", async () => {
    console.log(" balane user0 in mainnet = ", await tokenMainnet.balanceOf(user[0].address));

    console.log(" vote value user0 at block 25 = ", await DAOMainnet.getVotes(user[0].address, 25));

    console.log(" vote value user0 at block 25 by token =  ", await tokenMainnet.getPastVotes(user[0].address, 25));

    console.log(" vote value deployer at block 25 = ", await DAOMainnet.getVotes(deployer.address, 25));

    console.log(" state = ", await DAOMainnet.state(proposalId));
    //user0 vote on on Mainnet
    await expect(await DAOMainnet.connect(user[0]).castVote(proposalId, 1))
      .to.be.emit(DAOMainnet, "VoteCast")
      .withArgs(user[0].address, proposalId, 1, await tokenMainnet.balanceOf(user[0].address), "");
    //await voteTx.wait(1);
  });

  it(" proposes, votes, waits, queues, and then execute", async () => {
    // propose
    //vote
    //queue & execute
  });
});

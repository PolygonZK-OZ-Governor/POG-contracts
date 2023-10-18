const { ethers, upgrades } = require("hardhat");

const { getContractAddress } = require("@ethersproject/address");
const { expect } = require("chai");

const MerkleTreeBridge = require("@0xpolygonhermez/zkevm-commonjs").MTBridge;
const { verifyMerkleProof, getLeafValue } =
  require("@0xpolygonhermez/zkevm-commonjs").mtBridgeUtils;

describe(" Deploy", () => {
  let deployer;
  let rollup;

  let mainnetPolygonZkEVMGlobalExitRoot;
  let mainnetPolygonZkEVMBridgeContract;

  let testnetPolygonZkEVMGlobalExitRoot;
  let testnetPolygonZKEVMGlobalExitRoot;

  let tokenHub;
  let tokenSatellite;
  let DAOHub;

  let DAOHubMessenger;
  let DAOSatellite;

  let box;

  const networkIDMainnet = 0n;
  const networkIDRollup = 1n;

  const mainnetPolygonZkEVMAddress = "0x0000000000000000000000000000000000000000";
  const testnetPolygonZkEVMAddress = "0x1111111111111111111111111111111111111111";

  const defaultAddress = "0x2222222222222222222222222222222222222222";

  const REQUEST_COLLECTION_SIG = 0xae2f443b;
  const BRIDGE_PROPOSAL_SIG = 0x8579906e;
  const BRIDGE_VOTE_SIG = 0xcf53ead7;

  const LEAF_TYPE_MESSAGE = 1n;

  let user = new Array(10);
  beforeEach("Deploy contracts", async () => {
    //deployer
    [deployer, rollup, user[1], user[2], user[3], user[4], user[5], user[6], user[7], user[8]] =
      await ethers.getSigners();
    console.log("deployer's address: ", deployer.address);
    for (let i = 1; i < 9; i++) console.log(`user ${i} address `, user[i].address);
    //=========DEPLOY BRIDGE =============//

    // deploy mainnetPolygonZkEVMBridge
    const mainnetPolygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");

    mainnetPolygonZkEVMBridgeContract = await upgrades.deployProxy(
      mainnetPolygonZkEVMBridgeFactory,
      [],
      { initializer: false }
    );
    console.log(
      " mainnetPolygonZkEVMBridgeContract's address: ",
      mainnetPolygonZkEVMBridgeContract.address
    );
    // deploy global exit root manager
    const mainnetPolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory(
      "PolygonZkEVMGlobalExitRoot"
    );
    mainnetPolygonZkEVMGlobalExitRoot = await mainnetPolygonZkEVMGlobalExitRootFactory.deploy(
      rollup.address,
      mainnetPolygonZkEVMBridgeContract.address
    );

    console.log(
      " mainnetPolygonZKEVMGlobalExitRoot's address: ",
      mainnetPolygonZkEVMGlobalExitRoot.address
    );
    await mainnetPolygonZkEVMBridgeContract.initialize(
      networkIDMainnet,
      mainnetPolygonZkEVMGlobalExitRoot.address,
      mainnetPolygonZkEVMAddress
    );

    //===================================//
    //DAOtoken
    const tokenHubFactory = await ethers.getContractFactory("DAOToken");
    tokenHub = await tokenHubFactory.deploy("DAOToken", "DTK");
    console.log(" DAOMainnetToken at address: ", await tokenHub.address);

    //DAOHub with no spoke network
    const DAOHubFactory = await ethers.getContractFactory("DAOHub");
    DAOHub = await DAOHubFactory.deploy(tokenHub.address, [], []);
    console.log(" DAOhub's address: ", DAOHub.address);

    const nonceZkevm = Number(await deployer.getTransactionCount());

    const predictDAOHubMessenger = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm,
    });
    const predictDAOTokenSatellite = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm + 1,
    });
    const predictDAOSatellite = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm + 2,
    });
    console.log("predictDAOHubMessenger = ", predictDAOHubMessenger);
    console.log("predictDAOTokenSatellite = ", predictDAOTokenSatellite);
    console.log("predictDAOSatellite = ", predictDAOSatellite);

    //DAOHubMessenger
    const DAOHubMessengerFactory = await ethers.getContractFactory("DAOHubMessenger");
    DAOHubMessenger = await DAOHubMessengerFactory.deploy(
      mainnetPolygonZkEVMBridgeContract.address,
      predictDAOSatellite,
      1,
      DAOHub.address
    );
    console.log(" daoHubMessenger's address: ", await DAOHubMessenger.address);
    console.log("                counter address: ", await DAOHubMessenger.counterpartContract());
    console.log("                counter network: ", await DAOHubMessenger.counterpartNetwork());
    console.log("                Control address: ", await DAOHubMessenger.controller());

    //DAOSateToken
    tokenSatellite = await tokenHubFactory.deploy("DAOSatelliteToken", "wDTK");
    console.log("DAOSatelliteToken's address: ", await tokenSatellite.address);
    //DAOSatellite
    const daoStatelliteFactory = await ethers.getContractFactory("DAOSatellite");

    DAOSatellite = await daoStatelliteFactory.deploy(
      mainnetPolygonZkEVMBridgeContract.address,
      DAOHubMessenger.address,
      0n,
      tokenSatellite.address,
      12n
    );
    await DAOHub.addSpoke(1n, DAOHubMessenger.address);
    console.log("DAOSatellite's address: ", DAOSatellite.address);

    const boxFactory = await ethers.getContractFactory("Box");
    box = await boxFactory.deploy();
  });

  it(" bridge proposal ", async () => {
    //console.log(await tokenHub.balanceOf(deployer));

    for (let i = 1; i < 5; i++) {
      let v = getRandomInt(10000, 100000);
      await tokenHub.connect(deployer).transfer(user[i].address, BigInt(v));
      let vv = getRandomInt(10000, 100000);
      await tokenSatellite.connect(deployer).transfer(user[4 + i].address, BigInt(vv));
    }

    for (let i = 1; i < 5; i++)
      console.log(`balance of user[${i}] at mainNet = `, await tokenHub.balanceOf(user[i].address));
    for (let i = 1; i < 5; i++)
      console.log(
        `balance of user[${4 + i}] at spokeNet = `,
        await tokenSatellite.balanceOf(user[4 + i].address)
      );

    console.log(" box value = ", await box.retrieve());

    //create proposal change box value to 0 => 77
    //bug here
    encodedmessge = "";

    const message = encodeMessageData(BRIDGE_PROPOSAL_SIG, 1n, 100n);
    const messageHash = ethers.utils.solidityKeccak256(["bytes"], [message]);
    console.log(" messageHash = ", messageHash);
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);

    const originAddressLeaf = DAOHubMessenger.address;
    const destinationAddressLeaf = await DAOHubMessenger.counterpartContract();
    const destinationNetwork = 1;
    const originNetwork = 0;
    const amountLeaf = 0;
    const leafValue = getLeafValue(
      LEAF_TYPE_MESSAGE,
      originNetwork,
      originAddressLeaf,
      destinationNetwork,
      destinationAddressLeaf,
      amountLeaf,
      messageHash
    );

    merkleTree.add(leafValue);
    const rootJSMainnet = merkleTree.getRoot();
    const depositCount = await mainnetPolygonZkEVMBridgeContract.depositCount();
    const rollupExitRoot = await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();

    await expect(DAOHubMessenger.bridgeProposal(1n, 100n, true))
      .to.emit(DAOHubMessenger, `BridgeProposal`)
      .withArgs(1n, 100n)
      .to.emit(mainnetPolygonZkEVMBridgeContract, `BridgeEvent`)
      .withArgs(
        1,
        originNetwork,
        DAOHubMessenger.address,
        destinationNetwork,
        await DAOHubMessenger.counterpartContract(),
        amountLeaf,
        message,
        depositCount
      );

    // check merkle root with SC
    const rootSCMainnet = await mainnetPolygonZkEVMBridgeContract.getDepositRoot();
    expect(rootSCMainnet).to.be.equal(rootJSMainnet);

    const proof = merkleTree.getProofTreeByIndex(0);
    const index = 0;

    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    expect(
      await mainnetPolygonZkEVMBridgeContract.verifyMerkleProof(
        leafValue,
        proof,
        index,
        rootSCMainnet
      )
    ).to.be.equal(true);

    const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    expect(computedGlobalExitRoot).to.be.equal(
      await mainnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()
    );

    console.log("AFTER BRIDGE")
    console.log(" mainnet =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot());
    console.log(" rollup =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());

  });

  it("should claim proposal", async () => {
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);

    const message = encodeMessageData(BRIDGE_PROPOSAL_SIG, 1n, 100n);
    const messageHash = ethers.utils.solidityKeccak256(["bytes"], [message]);

    const originNetwork = 0;
    const destinationNetwork = 0;
    const originAddressLeaf = DAOHubMessenger.address;
    const destinationAddressLeaf = DAOSatellite.address;

    console.log(" messageHash = ", messageHash);
    const leafValue = getLeafValue(
      1,
      originNetwork,
      originAddressLeaf,
      destinationNetwork,
      destinationAddressLeaf,
      0,
      messageHash
    );

    merkleTree.add(leafValue);
    const rootJSRollup = merkleTree.getRoot();
    const mainnetExitRoot = await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

    await expect(mainnetPolygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
      .to.emit(mainnetPolygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
      .withArgs(mainnetExitRoot, rootJSRollup);

    console.log("after update =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());

    // check roots
    const rollupExitRootSC = await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();
    expect(rollupExitRootSC).to.be.equal(rootJSRollup);

    const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
    expect(computedGlobalExitRoot).to.be.equal(
      await mainnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()
    );

    // check merkle proof
    const proof = merkleTree.getProofTreeByIndex(0);
    const index = 0;

    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
    expect(
      await mainnetPolygonZkEVMBridgeContract.verifyMerkleProof(
        leafValue,
        proof,
        index,
        rootJSRollup
      )
    ).to.be.equal(true);
    console.log(" check isProposal ID 1 = ", await DAOSatellite.isProposal(1n));
    //claim message

      console.log(" mainnetExitRoot = ", mainnetExitRoot);
      console.log("rollupExitRootSC = ",rollupExitRootSC);

      console.log("BEFORE CLAIM")
      console.log(" mainnet =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot());
      console.log(" rollup =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());

    await expect(
      await mainnetPolygonZkEVMBridgeContract.claimMessage(
        proof,
        index,
        mainnetExitRoot,
        rollupExitRootSC,
        originNetwork,
        originAddressLeaf,
        destinationNetwork,
        destinationAddressLeaf,
        0,
        message
      )
    )
      .to.emit(mainnetPolygonZkEVMBridgeContract, "ClaimEvent")
      .withArgs(index, 0, DAOHubMessenger.address, DAOSatellite.address, 0);
    //.to.emit(DAOSatellite, "NewProposal")
    //.withArgs(1);

    console.log(" check isProposal ID 1 = ", await DAOSatellite.isProposal(1n));
  });
});

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

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
  return ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

const { ethers, upgrades } = require("hardhat");

const { getContractAddress } = require("@ethersproject/address");
const { expect } = require("chai");

const MerkleTreeBridge = require("@0xpolygonhermez/zkevm-commonjs").MTBridge;
const { verifyMerkleProof, getLeafValue } =
  require("@0xpolygonhermez/zkevm-commonjs").mtBridgeUtils;

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

describe(" Deploy", () => {
  let deployer;
  let rollup;

  let mainnetPolygonZkEVMGlobalExitRoot;
  let mainnetPolygonZkEVMBridgeContract;
  let testnetPolygonZkEVMGlobalExitRoot;
  let testnetPolygonZkEVMBridgeContract;

  let tokenHub;

  let tokenSatellite;

  let tokenBrigdeContractMainnet;
  let tokenBrigdeContractTestnet;

  const networkIDMainnet = 0;
  const networkIDRollup = 1;

  const mainnetPolygonZkEVMAddress = "0x0000000000000000000000000000000000000000";
  const testnetPolygonZkEVMAddress = "0x1111111111111111111111111111111111111111";
  const LEAF_TYPE_MESSAGE = 1n;

  let user = new Array(10);
  beforeEach("Deploy contracts", async () => {
    //deployer
    [deployer, rollup, user[1], user[2], user[3], user[4], user[5], user[6], user[7], user[8]] =
      await ethers.getSigners();
    // deploy mainnetPolygonZkEVMBridge
    const PolygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");

    //AT MAINNET
    mainnetPolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });
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

    //AT TESTNET
    testnetPolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });
    console.log(
      " testnetPolygonZkEVMBridgeContract's address: ",
      testnetPolygonZkEVMBridgeContract.address
    );
    // deploy global exit root manager
    const testnetPolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory(
      "PolygonZkEVMGlobalExitRoot"
    );
    testnetPolygonZkEVMGlobalExitRoot = await testnetPolygonZkEVMGlobalExitRootFactory.deploy(
      rollup.address,
      testnetPolygonZkEVMBridgeContract.address
    );

    console.log(
      " testnetPolygonZKEVMGlobalExitRoot's address: ",
      testnetPolygonZkEVMGlobalExitRoot.address
    );
    await testnetPolygonZkEVMBridgeContract.initialize(
      networkIDRollup,
      testnetPolygonZkEVMGlobalExitRoot.address,
      testnetPolygonZkEVMAddress
    );

    //===================================//

    //DAOtokenMainnet
    const tokenHubFactory = await ethers.getContractFactory("DAOToken");
    tokenHub = await tokenHubFactory.deploy("DAOToken", "DTK");
    console.log(" tokenHub at address: ", await tokenHub.address);

    const tokenBrigdeContractMainnetFactory = await ethers.getContractFactory(
      "ERC20BridgeNativeChain"
    );

    //DaotokenTestnet
    tokenSatellite = await tokenHubFactory.deploy("DAOSatelliteToken", "wDTK");
    console.log(" tokenSatellite at address: ", tokenSatellite.address);
    const nonceZkevm = Number(await deployer.getTransactionCount());
    const predictDAOHubMessenger = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm,
    });
    const predictTokenBridgeTestnet = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm + 1,
    });

    console.log("predict tokenBridge Mainnet = ", predictDAOHubMessenger);
    console.log("predict tokenBridge Testnet = ", predictTokenBridgeTestnet);

    tokenBrigdeContractMainnet = await tokenBrigdeContractMainnetFactory.deploy(
      mainnetPolygonZkEVMBridgeContract.address,
      predictTokenBridgeTestnet,
      networkIDRollup, //counterNetwork
      tokenHub.address
    );
    console.log("tokenBrigdeContractMainnet's address = ", tokenBrigdeContractMainnet.address);

    tokenBrigdeContractTestnet = await tokenBrigdeContractMainnetFactory.deploy(
      testnetPolygonZkEVMBridgeContract.address,
      tokenBrigdeContractMainnet.address,
      networkIDMainnet, //counterNetWork
      tokenSatellite.address
    );

    console.log("tokenBrigdeContractTestnet's address = ", tokenBrigdeContractTestnet.address);

    const DAOHubMessengerFactory = await ethers.getContractFactory("DAOHubMessenger");
    DAOHubMessenger = await DAOHubMessengerFactory.deploy(
      mainnetPolygonZkEVMBridgeContract.address,
      predictTokenBridgeTestnet,
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
    await expect(
      mainnetPolygonZkEVMBridgeContract.claimMessage(
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

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

function encodeMessageTranferData(destinationAddres,  amount) {
  return ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256"],
    [destinationAddres, amount]
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
    for (let i = 1; i < 5; i++) {
      let v = getRandomInt(10000, 100000);
      await tokenHub.connect(deployer).transfer(user[i].address, BigInt(v));
      let vv = getRandomInt(10000, 100000);
      await tokenSatellite.connect(deployer).transfer(user[4 + i].address, BigInt(vv));
    }
   
  });

  it(" tranfer token ", async () => {

    // Create 2 user
    let v = getRandomInt(10000, 100000);
    await tokenHub.connect(deployer).transfer(user[1].address, BigInt(v));
    let vv = getRandomInt(10000, 100000);
    await tokenSatellite.connect(deployer).transfer(user[2].address, BigInt(vv));
    // liqui to Bridge
    await tokenHub.connect(deployer).transfer( tokenBrigdeContractMainnet.address, BigInt(10000));
    await tokenSatellite.connect(deployer).transfer( tokenBrigdeContractTestnet.address, BigInt(10000) );

    console.log(`balance of user[1] at mainNet = `, await tokenHub.balanceOf(user[1].address));
    console.log(`balance of bridge at mainNet = `,await tokenHub.balanceOf(tokenBrigdeContractMainnet.address));
    console.log(`balance of user[2] at testNet = `,await tokenSatellite.balanceOf(user[2].address));
    console.log(`balance of bridge at testNet = `,await tokenSatellite.balanceOf(tokenBrigdeContractTestnet.address));

    const message = encodeMessageTranferData(  user[2].address ,5000);
    const messageHash = ethers.utils.solidityKeccak256(["bytes"], [message]);

    const originAddressLeaf = tokenBrigdeContractMainnet.address;
    const destinationAddressLeaf = tokenBrigdeContractTestnet.address;
    const originNetwork = 0;
    const destinationNetwork = 1;
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

    
    const depositCount = await mainnetPolygonZkEVMBridgeContract.depositCount();
    const rollupExitRoot = await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();


    await tokenHub.connect(user[1]).approve(tokenBrigdeContractMainnet.address, 5000);
    console.log(`balance of user[1] at mainNet = `, await tokenHub.balanceOf(user[1].address));

    await expect( tokenBrigdeContractMainnet.connect(user[1]).bridgeToken(user[2].address, 5000, true))
      .to.emit(tokenBrigdeContractMainnet, `BridgeTokens`)
      .withArgs(user[2].address, 5000)
      .to.emit(mainnetPolygonZkEVMBridgeContract, `BridgeEvent`)
      .withArgs(
        1,
        originNetwork,
        tokenBrigdeContractMainnet.address,
        destinationNetwork,
        tokenBrigdeContractTestnet.address,
        amountLeaf,
        message,
        depositCount
      );



    // create merkle local to check
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    merkleTree.add(leafValue);
    const rootJSMainnet = merkleTree.getRoot();

    // check merkle root with 
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

    let computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    expect(computedGlobalExitRoot).to.be.equal(
      await mainnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()
    );





    // update testNet Root by roll up account (relay will do this)
    const rootJSTestnet = rootJSMainnet 
    const testnetExitRoot = await testnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
     await expect(testnetPolygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSTestnet))
       .to.emit(testnetPolygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
       .withArgs(testnetExitRoot, rootJSTestnet);
   const rollupExitRootSC = await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();
       expect(rollupExitRootSC).to.be.equal(rootJSMainnet);
    computedGlobalExitRoot = calculateGlobalExitRoot(testnetExitRoot, rollupExitRootSC);
    expect(computedGlobalExitRoot).to.be.equal(
      await testnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()
    );

    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootJSTestnet)).to.be.equal(true);
    expect(
      await testnetPolygonZkEVMBridgeContract.verifyMerkleProof(
        leafValue,
        proof,
        index,
        rollupExitRootSC
      )
    ).to.be.equal(true);

    console.log(" testnetExitRoot ", testnetExitRoot);
    console.log("rollupExitRootSC ", rollupExitRootSC);

    console.log(" MAINNET AT MAINNET", await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot());

    console.log(" ROLLUP AT TESTNET", await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());
    
  console.log(" proof = ", destinationAddressLeaf);
    // claimMessage
    await expect(
      await testnetPolygonZkEVMBridgeContract.claimMessage(
        proof,
        index,
        await testnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot(),
        await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot(),
        originNetwork,
        originAddressLeaf,
        destinationNetwork,
        destinationAddressLeaf,
        0,
        message
      )
    )
    .to.emit(mainnetPolygonZkEVMBridgeContract, "ClaimEvent")
    .withArgs(index, 0, tokenBrigdeContractMainnet.address, tokenBrigdeContractTestnet.address, 0);
  });
});

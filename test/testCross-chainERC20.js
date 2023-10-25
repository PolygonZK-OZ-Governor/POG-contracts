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
function encodeMessageTranferData(destinationAddres, amount) {
  return ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [destinationAddres, amount]);
}
function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
  return ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

describe("Deploy", () => {
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

  const LEAF_TYPE_MESSAGE = 1;

  let user = new Array(10);
  beforeEach("Deploy contracts", async () => {
    //deployer
    [deployer, rollup, rolluptestnet, user[1], user[2], user[3], user[4], user[5], user[6], user[7], user[8]] = await ethers.getSigners();

    const PolygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");
    mainnetPolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });

    // deploy global exit root manager
    const mainnetPolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
    mainnetPolygonZkEVMGlobalExitRoot = await mainnetPolygonZkEVMGlobalExitRootFactory.deploy(
      rollup.address,
      mainnetPolygonZkEVMBridgeContract.address
    );

    await mainnetPolygonZkEVMBridgeContract.initialize(
      networkIDMainnet,
      mainnetPolygonZkEVMGlobalExitRoot.address,
      mainnetPolygonZkEVMAddress
    );

    testnetPolygonZkEVMBridgeContract = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });

    const testnetPolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
    testnetPolygonZkEVMGlobalExitRoot = await testnetPolygonZkEVMGlobalExitRootFactory.deploy(
      rollup.address,
      testnetPolygonZkEVMBridgeContract.address
    );

    await testnetPolygonZkEVMBridgeContract.initialize(
      networkIDRollup,
      testnetPolygonZkEVMGlobalExitRoot.address,
      testnetPolygonZkEVMAddress
    );

    //DAOtokenMainnet
    const tokenHubFactory = await ethers.getContractFactory("DAOToken");
    tokenHub = await tokenHubFactory.deploy("DAOToken", "DTK");

    //DaotokenTestnet
    tokenSatellite = await tokenHubFactory.deploy("DAOSatelliteToken", "wDTK");

    const nonceZkevm = Number(await deployer.getTransactionCount());

    const predictTokenBridgeTestnet = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm + 1,
    });

    const tokenBrigdeContractMainnetFactory = await ethers.getContractFactory("ERC20BridgeNativeChain");

    tokenBrigdeContractMainnet = await tokenBrigdeContractMainnetFactory.deploy(
      mainnetPolygonZkEVMBridgeContract.address,
      predictTokenBridgeTestnet,
      networkIDRollup,
      tokenHub.address
    );

    tokenBrigdeContractTestnet = await tokenBrigdeContractMainnetFactory.deploy(
      testnetPolygonZkEVMBridgeContract.address,
      tokenBrigdeContractMainnet.address,
      networkIDMainnet, //counterNetWork
      tokenSatellite.address
    );
  });

  it(" tranfer token from network 1 to network 0 ", async () => {
    // Create 2 user
    let v = getRandomInt(10000, 100000);
    await tokenHub.connect(deployer).transfer(user[1].address, BigInt(v));
    let vv = getRandomInt(10000, 100000);
    await tokenSatellite.connect(deployer).transfer(user[2].address, BigInt(vv));
    // liquidity to Bridge
    await tokenHub.connect(deployer).transfer(tokenBrigdeContractMainnet.address, BigInt(10000));
    await tokenSatellite.connect(deployer).transfer(tokenBrigdeContractTestnet.address, BigInt(10000));

    const balanceBeforeUser1 = Number(await tokenHub.balanceOf(user[1].address));
    const balanceBeforeUser2 = Number(await tokenSatellite.balanceOf(user[2].address));

    const message = encodeMessageTranferData(user[1].address, 5000);
    const messageHash = ethers.utils.solidityKeccak256(["bytes"], [message]);

    const originAddressLeaf = tokenBrigdeContractTestnet.address;
    const destinationAddressLeaf = tokenBrigdeContractMainnet.address;
    const originNetwork = 1;
    const destinationNetwork = 0;
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

    const depositCount = await testnetPolygonZkEVMBridgeContract.depositCount();
    const rollupExitRoot = await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();

    // appove
    await tokenSatellite.connect(user[2]).approve(tokenBrigdeContractTestnet.address, 5000);

    // bridgeToken
    await expect(tokenBrigdeContractTestnet.connect(user[2]).bridgeToken(user[1].address, 5000, true))
      .to.emit(tokenBrigdeContractTestnet, `BridgeTokens`)
      .withArgs(user[2].address, 5000)
      .to.emit(testnetPolygonZkEVMBridgeContract, `BridgeEvent`)
      .withArgs(
        1,
        originNetwork,
        tokenBrigdeContractTestnet.address,
        destinationNetwork,
        tokenBrigdeContractMainnet.address,
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
    const rootSCMainnet = await testnetPolygonZkEVMBridgeContract.getDepositRoot();
    expect(rootSCMainnet).to.be.equal(rootJSMainnet);
    const proof = merkleTree.getProofTreeByIndex(0);
    const index = 0;
    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    expect(await testnetPolygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);

    let computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    expect(computedGlobalExitRoot).to.be.equal(await testnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

    // update testNet Root by roll up account (relay will do this)
    const rootJSTestnet = rootJSMainnet;
    const mainnetExitRoot = await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
    await expect(mainnetPolygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSTestnet))
      .to.emit(mainnetPolygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
      .withArgs(mainnetExitRoot, rootJSTestnet);

    const rollupExitRootSC = await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();
    expect(rollupExitRootSC).to.be.equal(rootJSMainnet);
    computedGlobalExitRoot = calculateGlobalExitRoot(await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot(), rollupExitRootSC);
    expect(computedGlobalExitRoot).to.be.equal(await mainnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootJSTestnet)).to.be.equal(true);
    expect(
      await mainnetPolygonZkEVMBridgeContract.verifyMerkleProof(
        leafValue,
        proof,
        index,
        await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot()
      )
    ).to.be.equal(true);

    // claimMessage
    await expect(
      await mainnetPolygonZkEVMBridgeContract
        .connect(rollup)
        .claimMessage(
          proof,
          index,
          await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot(),
          await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot(),
          originNetwork,
          originAddressLeaf,
          destinationNetwork,
          destinationAddressLeaf,
          0,
          message
        )
    )
      .to.emit(mainnetPolygonZkEVMBridgeContract, "ClaimEvent")
      .withArgs(index, originNetwork, tokenBrigdeContractTestnet.address, tokenBrigdeContractMainnet.address, 0);

    expect(await tokenHub.balanceOf(user[1].address)).to.equal(balanceBeforeUser1 + 5000);
    expect(await tokenSatellite.balanceOf(user[2].address)).to.equal(balanceBeforeUser2 - 5000);

    await expect(
      mainnetPolygonZkEVMBridgeContract.claimAsset(
        proof,
        index,
        await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot(),
        await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot(),
        originNetwork,
        originAddressLeaf,
        destinationNetwork,
        destinationAddressLeaf,
        0,
        message
      )
    ).to.be.revertedWith("AlreadyClaimed");
  });

  it(" tranfer token from network 0 to network 1 ", async () => {
    // Create 2 user
    let v = getRandomInt(10000, 100000);
    await tokenHub.connect(deployer).transfer(user[1].address, BigInt(v));
    let vv = getRandomInt(10000, 100000);
    await tokenSatellite.connect(deployer).transfer(user[2].address, BigInt(vv));
    // liqui to Bridge
    await tokenHub.connect(deployer).transfer(tokenBrigdeContractMainnet.address, BigInt(10000));
    await tokenSatellite.connect(deployer).transfer(tokenBrigdeContractTestnet.address, BigInt(10000));

    console.log(`balance of user[1] before tranfer at mainNet = `, Number(await tokenHub.balanceOf(user[1].address)));
    //console.log(`balance of bridge at mainNet = `, await tokenHub.balanceOf(tokenBrigdeContractMainnet.address));
    console.log(`balance of user[2] before tranfer at testNet = `, Number(await tokenSatellite.balanceOf(user[2].address)));
    //console.log(`balance of bridge at testNet = `, await tokenSatellite.balanceOf(tokenBrigdeContractTestnet.address));

    const message = encodeMessageTranferData(user[2].address, 5000);
    const messageHash = ethers.utils.solidityKeccak256(["bytes"], [message]);

    const originAddressLeaf = tokenBrigdeContractMainnet.address;
    const destinationAddressLeaf = tokenBrigdeContractTestnet.address;
    const originNetwork = 0;
    const destinationNetwork = 1;
    const amountLeaf = 0;

    const leafValue = getLeafValue(
      1,
      originNetwork,
      originAddressLeaf,
      destinationNetwork,
      destinationAddressLeaf,
      amountLeaf,
      messageHash
    );

    const depositCount = await mainnetPolygonZkEVMBridgeContract.depositCount();
    const rollupExitRoot = await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();

    // appove
    await tokenHub.connect(user[1]).approve(tokenBrigdeContractMainnet.address, 5000);

    // bridgeToken
    await expect(tokenBrigdeContractMainnet.connect(user[1]).bridgeToken(user[2].address, 5000, true))
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
    expect(await mainnetPolygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    // console.log("AFTER BRIDGE");
    // console.log(" mainnet =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot());
    // console.log(" rollup =  ", await mainnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());

    let computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    expect(computedGlobalExitRoot).to.be.equal(await mainnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

    // update testNet Root by roll up account (relay will do this)
    const rootJSTestnet = rootJSMainnet;
    const testnetExitRoot = await testnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
    await expect(testnetPolygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSTestnet))
      .to.emit(testnetPolygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
      .withArgs(testnetExitRoot, rootJSTestnet);

    await testnetPolygonZkEVMBridgeContract.updateGlobalExitRoot();

    const rollupExitRootSC = await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot();
    expect(rollupExitRootSC).to.be.equal(rootJSMainnet);

    computedGlobalExitRoot = calculateGlobalExitRoot(testnetExitRoot, rollupExitRootSC);
    expect(computedGlobalExitRoot).to.be.equal(await testnetPolygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

    // verify merkle proof
    expect(verifyMerkleProof(leafValue, proof, index, rootJSTestnet)).to.be.equal(true);
    expect(
      await testnetPolygonZkEVMBridgeContract.verifyMerkleProof(
        leafValue,
        proof,
        index,
        await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot()
      )
    ).to.be.equal(true);

    // console.log(" testnetExitRoot ", testnetExitRoot);
    // console.log("rollupExitRootSC ", rollupExitRootSC);

    // console.log("BEFORE CLAIM");
    // console.log(" mainnet =  ", await testnetPolygonZkEVMGlobalExitRoot.lastMainnetExitRoot());
    // console.log(" rollup =  ", await testnetPolygonZkEVMGlobalExitRoot.lastRollupExitRoot());
    // console.log(" i don't know verify on chain is true but claim is wrong ");
    // // claimMessage
    await expect(
      await testnetPolygonZkEVMBridgeContract
        .connect(rollup)
        .claimMessage(
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

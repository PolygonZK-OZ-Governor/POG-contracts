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

describe(" Deploy", () => {
  let deployer;
  let rollup;
  let user = new Array(10);

  let PolygonZkEVMBridgeContract0;
  let PolygonZkEVMBridgeContract1;

  let PolygonZkEVMGlobalExitRoot0;
  let PolygonZkEVMGlobalExitRoot1;

  let token0;
  let token1;

  let tokenBridgeContract0;
  let tokenBridgeContract1;

  const networkIDMainnet = 0;
  const networkIDRollup = 1;

  const PolygonZkEVMAddress0 = "0x0000000000000000000000000000000000000000";
  const PolygonZkEVMAddress1 = "0x1111111111111111111111111111111111111111";
  const PolygonZkEVMAddress2 = "0x2222222222222222222222222222222222222222";

  const LEAF_TYPE_MESSAGE = 1;

  beforeEach("Deploy contracts", async () => {
    [deployer, rollup, rolluptestnet, user[1], user[2], user[3], user[4], user[5], user[6], user[7], user[8]] = await ethers.getSigners();

    const PolygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");

    //AT PolygonZkEVMBridgeContract at net work 0
    PolygonZkEVMBridgeContract0 = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });

    // deploy global exit root manager at network 0
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
    PolygonZkEVMGlobalExitRoot0 = await PolygonZkEVMGlobalExitRootFactory.deploy(rollup.address, PolygonZkEVMBridgeContract0.address);
    await PolygonZkEVMBridgeContract0.initialize(networkIDMainnet, PolygonZkEVMGlobalExitRoot0.address, PolygonZkEVMAddress0);

    // deploy PolygonZkEVMBridgeContract at network 1
    PolygonZkEVMBridgeContract1 = await upgrades.deployProxy(PolygonZkEVMBridgeFactory, [], {
      initializer: false,
    });

    // deploy global exit root manager at network 1
    PolygonZkEVMGlobalExitRoot1 = await PolygonZkEVMGlobalExitRootFactory.deploy(rollup.address, PolygonZkEVMBridgeContract1.address);
    await PolygonZkEVMBridgeContract1.initialize(networkIDRollup, PolygonZkEVMGlobalExitRoot1.address, PolygonZkEVMAddress1);

    // deploy token at two network
    const tokenFactory = await ethers.getContractFactory("DAOToken");
    token0 = await tokenFactory.deploy("DAOToken", "DTK");
    token1 = await tokenFactory.deploy("DAOSatelliteToken", "wDTK");

    // predict address tokenBridge1
    const nonceZkevm = Number(await deployer.getTransactionCount());
    const predictTokenBridge1Address = getContractAddress({
      from: deployer.address,
      nonce: nonceZkevm + 1,
    });

    // deploy two bridgeBaseContract for 2 network
    const tokenBrigdeContractMainnetFactory = await ethers.getContractFactory("ERC20BridgeNativeChain");
    tokenBridgeContract0 = await tokenBrigdeContractMainnetFactory.deploy(
      PolygonZkEVMBridgeContract0.address,
      predictTokenBridge1Address,
      networkIDRollup,
      token0.address
    );

    tokenBridgeContract1 = await tokenBrigdeContractMainnetFactory.deploy(
      PolygonZkEVMBridgeContract1.address,
      tokenBridgeContract0.address, //counterpart-contract
      networkIDMainnet, //counterpart-NetWork
      token1.address
    );

    // setup uset at two network
    for (let i = 1; i < 5; i++) {
      let v = getRandomInt(10000, 100000);
      await token0.connect(deployer).transfer(user[i].address, BigInt(v));
      let vv = getRandomInt(10000, 100000);
      await token1.connect(deployer).transfer(user[4 + i].address, BigInt(vv));
    }
  });

  it(" proposes, votes, waits, queues, and then execute", async () => {
    // propose
    //vote
    //queue & execute
  });
});

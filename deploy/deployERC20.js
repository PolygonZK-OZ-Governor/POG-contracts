const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { expect } = require("chai");

const mainnetBridgeAddress = "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe";
const testnetBridgeAddress = "0xF6BEEeBB578e214CA9E23B0e9683454Ff88Ed2A7";

const networkIDMainnet = 0;
const networkIDzkEVM = 1;

async function main() {
  let zkEVMProvider;
  let zkEVMBridgeContractAddress;
  zkEVMBridgeContractAddress = testnetBridgeAddress;
  zkEVMProvider = new ethers.providers.JsonRpcProvider("https://rpc.public.zkevm-test.net");

  let deployer;

  if (process.env.PVTKEY) {
    deployer = new ethers.Wallet(process.env.PVTKEY, ethers.provider);
    deployerZkEVM = new ethers.Wallet(process.env.PVTKEY, zkEVMProvider);

    console.log("Using pvtKey deployer with address: ", deployer.address, " balance = ", await deployer.getBalance());
  } else {
    [deployer] = await ethers.getSigners();
  }

  const boxFactory = await ethers.getContractFactory("Box", deployer);
  console.log("Deploying box...");
  const box = await boxFactory.deploy();
  await box.deployed();
  console.log("box deployed", box.address);

  //MainnetToken
  const name = "DAOToken";
  const symbol = "DTK";
  const erc20MainnetTokenFactory = await ethers.getContractFactory("DAOToken", deployer);
  console.log("Deploying erc20MainnetTokenFactory...");
  const erc20MainnetToken = await erc20MainnetTokenFactory.deploy("DAOToken", "DTK");
  await erc20MainnetToken.deployed();
  console.log("erc20MainnetTokenFactory deployed", erc20MainnetToken.address);
  const nonceZkevm = Number(await deployerZkEVM.getTransactionCount());
  const predictERC20BridgeZkEVM = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceZkevm });
  const predictErc20zkEVMToken = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceZkevm + 1 });

  const ERC20BridgeMainnetFactory = await ethers.getContractFactory("ERC20BridgeNativeChain", deployer);

  const ERC20BridgeMainnet = await ERC20BridgeMainnetFactory.deploy(
    zkEVMBridgeContractAddress,
    predictERC20BridgeZkEVM,
    networkIDzkEVM,
    erc20MainnetToken.address
  );
  await ERC20BridgeMainnet.deployed();
  console.log("ERC20BridgeMainnet deployed");

  const ERC20BridgezkEVMFactory = await ethers.getContractFactory("ERC20BridgeNativeChain", deployerZkEVM);
  const ERC20BridgezkEVM = await ERC20BridgezkEVMFactory.deploy(
    zkEVMBridgeContractAddress,
    ERC20BridgeMainnet.address,
    networkIDMainnet,
    predictErc20zkEVMToken
  );

  await ERC20BridgezkEVM.deployed();
  console.log("ERC20BridgezkEVM deployed");

  const erc20zkEVMTokenFactory = await ethers.getContractFactory("DAOToken", deployerZkEVM);
  const erc20zkEVMToken = await erc20zkEVMTokenFactory.deploy("DAOSatelliteToken", "wDTK");
  await erc20zkEVMToken.deployed();
  console.log("erc20zkEVMToken deployed");

  expect(predictERC20BridgeZkEVM).to.be.equal(ERC20BridgezkEVM.address);
  expect(predictErc20zkEVMToken).to.be.equal(erc20zkEVMToken.address);

  const outputJson = {
    ERC20BridgeMainnet: ERC20BridgeMainnet.address,
    ERC20BridgezkEVM: ERC20BridgezkEVM.address,
    erc20MainnetToken: erc20MainnetToken.address,
    erc20zkEVMToken: erc20zkEVMToken.address,
    deployerAddress: deployer.address,
  };

  const pathOutputJson = path.join(__dirname, "./ERC20Bridge_output.json");

  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

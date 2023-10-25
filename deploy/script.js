const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ethers } = require("hardhat");
const pathdeployeERC20Bridge = path.join(__dirname, "../deploy/ERC20Bridge_output.json");
const deploymentERC20Bridge = require(pathdeployeERC20Bridge);
const zkEVMProvider = new ethers.providers.JsonRpcProvider("https://rpc.public.zkevm-test.net");

const mekrleProofString = "/merkle-proof";
const getClaimsFromAcc = "/bridges/";

const mainnetBridgeAddress = "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe";
const testnetBridgeAddress = "0xF6BEEeBB578e214CA9E23B0e9683454Ff88Ed2A7";

async function main() {
  let deployer = new ethers.Wallet(process.env.PVTKEY, ethers.provider);
  deployerZkEVM = new ethers.Wallet(process.env.PVTKEY, zkEVMProvider);

  console.log("Using pvtKey deployer with address: ", deployer.address);

  let erc20tokenFactory = await ethers.getContractFactory("DAOToken", deployer);
  let tokenMainnet = await erc20tokenFactory.attach(deploymentERC20Bridge.erc20MainnetToken);

  console.log(" balance in mainnet = ", await tokenMainnet.balanceOf(deployer.address));

  let tokenTestnetFactory = await ethers.getContractFactory("DAOToken", deployerZkEVM);
  let tokenTestnet = await tokenTestnetFactory.attach(deploymentERC20Bridge.erc20zkEVMToken);
  console.log(" balance in testnet = ", await tokenTestnet.balanceOf(deployerZkEVM.address));

  //tranfer from mainnet to testnet

  let bridgeMainnetFactory = await ethers.getContractFactory("ERC20BridgeNativeChain", deployer);
  let bridgeMainnet = await bridgeMainnetFactory.attach(deploymentERC20Bridge.ERC20BridgeMainnet);

  let bridgeTestnetFactory = await ethers.getContractFactory("ERC20BridgeNativeChain", deployerZkEVM);
  let bridgeTestnet = await bridgeTestnetFactory.attach(deploymentERC20Bridge.ERC20BridgezkEVM);

  console.log(" check counterpart in bridge mainnet", await bridgeMainnet.counterpartContract());
  console.log(" check counternetwork in bridge mainnet", await bridgeMainnet.counterpartNetwork());
  console.log(" check counterpart in bridge testnet", await bridgeTestnet.counterpartContract());
  console.log(" check counternetwork in bridge testnet", await bridgeTestnet.counterpartNetwork());
  //await tokenTestnet.connect(deployerZkEVM).transfer(bridgeTestnet.address, 10000);

  console.log("balance bridge in testnet ", await tokenTestnet.balanceOf(bridgeTestnet.address));
  //appove;

  // await (await tokenMainnet.approve(bridgeMainnet.address, 1000)).wait();
  console.log("approved tokens");
  //0x6bf9e6e1b5463d58101f1bc62d2620cba7c8481f76de514097737bc073e84283
  //0x7c13917312161c6e207b1d138bd30ba108704ed62a423414103bac82c9128b8c //
  //  const tx = await bridgeMainnet.bridgeToken(deployerZkEVM.address, 1000, true);
  // console.log((await tx.wait()).transactionHash);

  //=====
  //await (await tokenTestnet.approve(bridgeTestnet.address, 1000)).wait();
  //const tx = await bridgeTestnet.bridgeToken(deployer.address, 1000, true);
  //console.log((await tx.wait()).transactionHash);
  //0xc11396921d63200035b8986aa342409c0367bb4bb76efe25b866fdad781cb53e//
  //=====
  const bridgeFactoryZkeEVm = await ethers.getContractFactory("PolygonZkEVMBridge", deployerZkEVM);
  const bridgeContractZkeVM = bridgeFactoryZkeEVm.attach(testnetBridgeAddress);

  const ZKmainnetFactory = await ethers.getContractFactory("PolygonZkEVMBridge", deployer);
  const ZKmainnet = ZKmainnetFactory.attach(testnetBridgeAddress);
  console.log("Bridge done succesfully");

  let baseURL = "https://bridge-api.public.zkevm-test.net";
  const axios = require("axios").create({
    baseURL,
  });

  const depositAxions = await axios.get(getClaimsFromAcc + deploymentERC20Bridge.ERC20BridgeMainnet, { params: { limit: 100, offset: 0 } });
  const depositsArray = depositAxions.data.deposits;

  if (depositsArray.length === 0) {
    console.log("Not deposits yet!");
    return;
  }
  console.log("depositsArray = ", depositsArray);
  for (let i = 0; i < depositsArray.length; i++) {
    const currentDeposit = depositsArray[i];
    if (currentDeposit.ready_for_claim) {
      if (currentDeposit.claim_tx_hash != "") {
        console.log("already claimed: ", currentDeposit.claim_tx_hash);
        continue;
      }

      const proofAxios = await axios.get(mekrleProofString, {
        params: { deposit_cnt: currentDeposit.deposit_cnt, net_id: currentDeposit.orig_net },
      });

      const { proof } = proofAxios.data;
      const claimTx = await ZKmainnet.claimMessage(
        proof.merkle_proof,
        currentDeposit.deposit_cnt,
        proof.main_exit_root,
        proof.rollup_exit_root,
        currentDeposit.orig_net,
        currentDeposit.orig_addr,
        currentDeposit.dest_net,
        currentDeposit.dest_addr,
        currentDeposit.amount,
        currentDeposit.metadata
      );
      console.log("claim message succesfully send: ", claimTx.hash);
      await claimTx.wait();
      console.log("claim message succesfully mined");
    } else {
      console.log("Not ready yet!");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

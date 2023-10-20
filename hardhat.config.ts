import { HardhatUserConfig } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "@ethersproject/address";
import "@nomiclabs/hardhat-waffle";
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      {
        version: "0.8.0",
      },
    ],
  },
  gasReporter: {
    enabled: false,
  },
};

export default config;

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { getContractAddress } = require("@ethersproject/address");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");
const MerkleTreeBridge = require("@0xpolygonhermez/zkevm-commonjs").MTBridge;
const { getLeafValue } = require("@0xpolygonhermez/zkevm-commonjs").mtBridgeUtils;

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
// Because deploy in real network has many time, so we simulation it on hardhat, so we added a function to update root
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

    let merkleTreeMainnet;
    let merkleTreeTestnet;

    let calldata;

    let countMainnetLeaf = 0;
    let countTestnetLeaf = 0;

    it("Setup", async () => {
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
            12n
        );
        expect(predictDAOtestnet).to.be.equal(DAOTestnet.address);

        //add DAO testnet to DAO Mainnet
        await DAOMainnet.addSpoke(1n, DAOHubMessenger.address);
        expect(await DAOMainnet.messengers(1)).to.be.equal(DAOHubMessenger.address);

        //setup random balance
        for (let i = 0; i < 4; i++) {
            let v = getRandomInt(10000, 100000);
            tokenMainnet.connect(user[i]).delegate(user[i].address);
            await tokenMainnet.connect(deployer).transfer(user[i].address, BigInt(v));
            v = getRandomInt(10000, 100000);
            tokenTestnet.connect(user[i + 4]).delegate(user[i + 4].address);
            await tokenTestnet.connect(deployer).transfer(user[i + 4].address, BigInt(v));
        }

        //Box contract
        const boxFactory = await ethers.getContractFactory("Box");
        box = await boxFactory.deploy();
    });

    it(" Create proposal, votes, waits, queues, and then execute", async () => {
        let ABI = ["function store(uint256 newValue)"];
        let iBox = new ethers.utils.Interface(ABI);
        const tx = iBox.encodeFunctionData("store", [77n]);
        calldata = tx;
        const proposalTx = await DAOMainnet.propose([box.address], [0], [tx], "Proposal #1 set 77 in the Box!");
        const receiptProposalTx = await proposalTx.wait();
        console.log(" ProposalId =  ", receiptProposalTx.events[0].args.proposalId.toString());
        proposalId = receiptProposalTx.events[0].args.proposalId;
        merkleTreeMainnet = new MerkleTreeBridge(32);
        merkleTreeTestnet = new MerkleTreeBridge(32);
        await bridgeMainnetToTestnet();
        console.log(" is proposal ", await DAOTestnet.isProposal(proposalId));
        console.log(" proposal snapshot = ", await DAOMainnet.proposalSnapshot(proposalId));
        console.log(" proposal deadline = ", await DAOMainnet.proposalDeadline(proposalId));
        console.log(" block now = ", await ethers.provider.getBlockNumber());
    });

    it("Vote on multi chain", async () => {
        //user0 vote on Mainnet
        await expect(await DAOMainnet.connect(user[0]).castVote(proposalId, 1))
            .to.be.emit(DAOMainnet, "VoteCast")
            .withArgs(user[0].address, proposalId, 1, await tokenMainnet.balanceOf(user[0].address), "");

        //user4 vote on Testnet
        await expect(await DAOTestnet.connect(user[4]).castVote(proposalId, 1))
            .to.be.emit(DAOTestnet, "VoteCasted")
            .withArgs(proposalId, user[4].address, 1, await tokenTestnet.balanceOf(user[4].address));
    });
    it("Vote in hub chain after deadline", async () => {
        await mine(100);
        await expect(DAOMainnet.connect(user[1]).castVote(proposalId, 1)).to.be.revertedWith(
            "Governor: vote not currently active"
        );
    });

    it("Vote in spoke chain after deadline", async () => {
        await mine(100);
        await expect(DAOTestnet.connect(user[5]).castVote(proposalId, 1)).to.be.revertedWith(
            "Governor: vote not currently active"
        );
    });

    it("Collect vote", async () => {
        await mine(1000);
        //collect vote from testnet to mainnet
        await DAOMainnet.requestCollections(proposalId, true);

        //Bridge
        await bridgeMainnetToTestnet();
        await bridgeTestnetToMainnet();

        //finish phase collection

        await DAOMainnet.execute(
            [box.address],
            [0],
            [calldata],
            await ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Proposal #1 set 77 in the Box!"))
        );
        expect(await box.retrieve()).to.be.equal(77);
    });

    async function bridgeMainnetToTestnet() {
        let receipt = await PZKbridgeMainnet.queryFilter("BridgeEvent", 0, await ethers.provider.getBlockNumber());
        var newLeaf = getLeafValue(
            receipt[receipt.length - 1].args.leafType,
            receipt[receipt.length - 1].args.originNetwork,
            receipt[receipt.length - 1].args.originAddress,
            receipt[receipt.length - 1].args.destinationNetwork,
            receipt[receipt.length - 1].args.destinationAddress,
            receipt[receipt.length - 1].args.amount,
            ethers.utils.keccak256(receipt[receipt.length - 1].args.metadata)
        );
        merkleTreeMainnet.add(newLeaf);
        let proof = merkleTreeMainnet.getProofTreeByIndex(receipt.length - 1);
        await PZKRootTestnet.updateMainnetRootForTesting(await PZKRootMainnet.lastMainnetExitRoot());
        await PZKbridgeTestnet.claimMessage(
            proof,
            receipt.length - 1,
            await PZKRootTestnet.lastMainnetExitRoot(),
            await PZKRootTestnet.lastRollupExitRoot(),
            receipt[receipt.length - 1].args.originNetwork,
            receipt[receipt.length - 1].args.originAddress,
            receipt[receipt.length - 1].args.destinationNetwork,
            receipt[receipt.length - 1].args.destinationAddress,
            receipt[receipt.length - 1].args.amount,
            receipt[receipt.length - 1].args.metadata
        );
    }

    async function bridgeTestnetToMainnet() {
        let receipt = await PZKbridgeTestnet.queryFilter("BridgeEvent", 0, await ethers.provider.getBlockNumber());

        let newLeaf = getLeafValue(
            receipt[receipt.length - 1].args.leafType,
            receipt[receipt.length - 1].args.originNetwork,
            receipt[receipt.length - 1].args.originAddress,
            receipt[receipt.length - 1].args.destinationNetwork,
            receipt[receipt.length - 1].args.destinationAddress,
            receipt[receipt.length - 1].args.amount,
            ethers.utils.keccak256(receipt[receipt.length - 1].args.metadata)
        );
        merkleTreeTestnet.add(newLeaf);

        await PZKRootMainnet.connect(admin).updateExitRoot(merkleTreeTestnet.getRoot());
        proof = merkleTreeTestnet.getProofTreeByIndex(receipt.length - 1);

        await expect(
            await PZKbridgeMainnet.claimMessage(
                proof,
                receipt.length - 1,
                await PZKRootMainnet.lastMainnetExitRoot(),
                await PZKRootMainnet.lastRollupExitRoot(),
                receipt[receipt.length - 1].args.originNetwork,
                receipt[receipt.length - 1].args.originAddress,
                receipt[receipt.length - 1].args.destinationNetwork,
                receipt[receipt.length - 1].args.destinationAddress,
                0,
                receipt[receipt.length - 1].args.metadata
            )
        )
            .to.emit(PZKbridgeMainnet, "ClaimEvent")
            .withArgs(0, 1, DAOTestnet.address, DAOHubMessenger.address, 0);
    }
});

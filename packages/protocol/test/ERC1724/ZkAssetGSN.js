/* global artifacts, expect, contract, beforeEach, web3, it:true */
const { JoinSplitProof } = require('aztec.js');
const secp256k1 = require('@aztec/secp256k1');
const BN = require('bn.js');
const {
    getRelayHub,
    isRelayHubDeployed,
    registerRelay,
    runRelayer,
    deployRelayHub,
    fundRecipient,
    balance,
    withdraw,
} = require('@openzeppelin/gsn-helpers');
const { GSNProvider } = require('@openzeppelin/gsn-provider');
const { toWei } = require('web3-utils');

const ACE = artifacts.require('./ACE');
const ERC20Mintable = artifacts.require('./ERC20Mintable');
const helpers = require('../helpers/ERC1724');
const ZkAssetGSN = require('../../build/contracts/ZkAssetGSN');

const aztecAccount = secp256k1.generateAccount();

contract('ZkAssetGSN', (accounts) => {
    let ace;
    let erc20;
    const publicOwner = accounts[0];
    const scalingFactor = 10;
    let zkAssetGSN;
    let gsnProvider;
    let recipientAddress;

    const relayHubAddress = '0xd216153c06e857cd7f72665e0af1d7d82172f494'; // constant across development, testnets and mainnet
    const sender = accounts[2];

    before(async () => {
        ace = await ACE.at(ACE.address);
        erc20 = await ERC20Mintable.new({ from: accounts[0] });

        // // Deploy a relay hub instance
        // await deployRelayHub(web3, {
        //     from: accounts[0],
        // });

        // console.log('deployed relayhub')

        // // Download the platform-specific binary and run a relayer
        // console.log('process: ', process.cwd);
        // await runRelayer({
        //     relayUrl: 'http://localhost:8090',
        //     devMode: true,
        //     ethereumNodeURL: 'http://localhost:8545',
        //     gasPricePercent: 0,
        //     quiet: true,
        //     port: 8090,
        // });

        // console.log('running relayer')

        // // Register a relayer in the hub, requires the relayer process to be running
        // const result = await registerRelay(web3, {
        //     relayUrl: 'http://localhost:8090',
        //     stake: toWei('1'),
        //     unstakeDelay: 604800, // 1 week
        //     funds: toWei('5'),
        //     from: accounts[0],
        // });

        // console.log({ result });

        // Note: we need access to the setProvider() method on the deployed zkAssetGSN
        // TruffleContract abstracts this away from the user, so need to deploy this contract
        // directly using web3

        const zkAssetGSNInstance = new web3.eth.Contract(ZkAssetGSN.abi, null, { data: ZkAssetGSN.bytecode });

        zkAssetGSN = await zkAssetGSNInstance
            .deploy({ data: zkAssetGSNInstance.options.data, arguments: [ace.address, erc20.address, scalingFactor] })
            .send({ from: accounts[0], gas: 6e6 });

        recipientAddress = zkAssetGSN.options.address;

        gsnProvider = new GSNProvider('http://localhost:8545', {
            ownerAddress: accounts[0],
            relayerAddress: accounts[1],
        });

        zkAssetGSN.setProvider(gsnProvider);

        // Register the recipient in  the hub, and fund it so it can pay for meta transactions
        await fundRecipient(web3, {
            recipient: recipientAddress,
            amount: toWei('1'),
            from: accounts[0],
        });
    });

    describe.only('Success states', async () => {
        it('should setup zkAssetGSN to use GSN', () => {
            // eslint-disable-next-line no-underscore-dangle
            const gsnStatus = zkAssetGSN._provider.useGSN;
            expect(gsnStatus).to.equal(true);
        });

        it('should deploy relay hub', async () => {
            const deployStatus = await isRelayHubDeployed(web3);
            const relayHub = await getRelayHub(web3, relayHubAddress);
            expect(deployStatus).to.equal(true);
            expect(relayHub).to.not.equal(undefined);
        });

        it('should have set recipient balance', async () => {
            const amountFunded = 1e18;
            const relayHub = await getRelayHub(web3, relayHubAddress);
            const recipientBalance = await relayHub.methods.balanceOf(recipientAddress).call({ from: sender, gas: 5e6 });
            const relayHubBalance = await web3.eth.getBalance(relayHubAddress);
            expect(parseInt(recipientBalance, 10)).to.equal(amountFunded);
            expect(recipientBalance).to.equal(relayHubBalance);
        });

        it.only('should send confidentialTransfer() tx via the GSN', async () => {
            const initialRecipientFunds = await balance(web3, { recipient: recipientAddress });
            console.log({ initialRecipientFunds });

            const relayHubBalance = await web3.eth.getBalance(relayHubAddress);
            console.log({ relayHubBalance });

            const depositInputNotes = [];
            const depositOutputNotes = await helpers.getNotesForAccount(aztecAccount, [20, 10]);
            const publicValue = -30;

            const depositProof = new JoinSplitProof(depositInputNotes, depositOutputNotes, sender, publicValue, publicOwner);
            console.log('constructed proof');
            const depositData = depositProof.encodeABI(recipientAddress);
            const signatures = depositProof.constructSignatures(recipientAddress, []);

            await ace.publicApprove(recipientAddress, depositProof.hash, 30, { from: accounts[0] });
            console.log('called public approve');
            console.log('recipient address: ', recipientAddress);

            const { receipt } = await zkAssetGSN.methods.confidentialTransfer(depositData, signatures).send({
                from: sender,
                gas: 8e6,
                useGSN: true,
            });
            console.log({ receipt });
            expect(receipt.status).to.equal(true);

            const postTxRecipientFunds = await balance(web3, { recipient: recipientAddress });
            expect(postTxRecipientFunds).to.be.below(initialRecipientFunds);
        });

        it('should accept all transactions sent', async () => {});
        it('should reject a transaction if recipient funds have been exhausted', async () => {});
    });

    describe('Failure states', async () => {
        it('should reject an unbalanced proof');
    });
});

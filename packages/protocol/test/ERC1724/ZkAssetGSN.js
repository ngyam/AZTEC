/* global artifacts, expect, contract, web3, it:true */
const { JoinSplitProof } = require('aztec.js');
const secp256k1 = require('@aztec/secp256k1');
const { getRelayHub, isRelayHubDeployed, fundRecipient, balance } = require('@openzeppelin/gsn-helpers');
const { GSNProvider } = require('@openzeppelin/gsn-provider');
const { toWei } = require('web3-utils');

const ACE = artifacts.require('./ACE');
const ERC20Mintable = artifacts.require('./ERC20Mintable');
const helpers = require('../helpers/ERC1724');
const Counter = require('../../build/contracts/Counter');
const ZkAssetGSN = require('../../build/contracts/ZkAssetGSN');

const aztecAccount = secp256k1.generateAccount();

contract.only('ZkAssetGSN', (accounts) => {
    let ace;
    let erc20;
    const publicOwner = accounts[0];
    const scalingFactor = 10;
    let zkAssetGSN;
    let gsnProvider;

    const RELAY_HUB_ADDRESS = '0xd216153c06e857cd7f72665e0af1d7d82172f494'; // constant across development, testnets and mainnet
    const sender = accounts[2];
    let counterContract;

    before(async () => {
        gsnProvider = new GSNProvider('http://localhost:8545', {
            ownerAddress: accounts[0],
            relayerAddress: accounts[1],
            useGNS: true,
        });

        ace = await ACE.at(ACE.address);
        erc20 = await ERC20Mintable.new({ from: accounts[0] });

        // Note: we need access to the setProvider() method on the deployed zkAssetGSN
        // TruffleContract abstracts this away from the user, so need to deploy this contract
        // directly using web3
        const zkAssetGSNInstance = new web3.eth.Contract(ZkAssetGSN.abi, null, { data: ZkAssetGSN.bytecode });

        zkAssetGSN = await zkAssetGSNInstance
            .deploy({ data: zkAssetGSNInstance.options.data, arguments: [ace.address, erc20.address, scalingFactor] })
            .send({ from: accounts[0], gas: 6e6 });
        zkAssetGSN.setProvider(gsnProvider);

        const counterInstance = new web3.eth.Contract(Counter.abi, null, { data: Counter.bytecode });
        const initialCount = 5;
        counterContract = await counterInstance
            .deploy({ data: counterInstance.options.data, arguments: [initialCount] })
            .send({ from: accounts[0], gas: 5e6 });

        counterContract.setProvider(gsnProvider);

        // Register the zkAssetGSN in  the hub, and fund it so it can pay for meta transactions
        await fundRecipient(web3, {
            recipient: zkAssetGSN.options.address,
            amount: toWei('1'),
            from: accounts[0],
        });

        // Register the recipient in  the hub, and fund it so it can pay for meta transactions
        await fundRecipient(web3, {
            recipient: counterContract.options.address,
            amount: toWei('1'),
            from: accounts[0],
        });
    });

    describe('Success states', async () => {
        it('should setup zkAssetGSN to use GSN', async () => {
            // eslint-disable-next-line no-underscore-dangle
            const gsnStatus = zkAssetGSN._provider.useGSN;
            expect(gsnStatus).to.equal(true);
        });

        it('should deploy relay hub', async () => {
            const deployStatus = await isRelayHubDeployed(web3);
            const relayHub = await getRelayHub(web3, RELAY_HUB_ADDRESS);
            expect(deployStatus).to.equal(true);
            expect(relayHub).to.not.equal(undefined);
        });

        it('should have zkAssetGSN contract gas balance', async () => {
            const amountFunded = 1e18;
            const relayHub = await getRelayHub(web3, RELAY_HUB_ADDRESS);
            const recipientBalance = await relayHub.methods
                .balanceOf(zkAssetGSN.options.address)
                .call({ from: sender, gas: 5e6 });
            const relayHubBalance = await web3.eth.getBalance(RELAY_HUB_ADDRESS);
            expect(parseInt(recipientBalance, 10)).to.equal(amountFunded);
            expect(recipientBalance * 2).to.equal(parseInt(relayHubBalance, 10));
        });

        it('should set counter contract gas balance', async () => {
            const amountFunded = 1e18;
            const relayHub = await getRelayHub(web3, RELAY_HUB_ADDRESS);
            const counterBalance = await relayHub.methods
                .balanceOf(counterContract.options.address)
                .call({ from: sender, gas: 5e6 });
            const relayHubBalance = await web3.eth.getBalance(RELAY_HUB_ADDRESS);
            expect(parseInt(counterBalance, 10)).to.equal(amountFunded);
            expect(counterBalance * 2).to.equal(parseInt(relayHubBalance, 10));
        });

        it('should send counter contract tx via the GSN', async () => {
            const initialRecipientFunds = await balance(web3, { recipient: zkAssetGSN.options.address });
            await counterContract.methods.getHubAddr().send({ from: accounts[3], useGSN: true, gas: 5e6 });
            const { receipt } = await counterContract.methods.setCounter(6).send({ from: accounts[3], gas: 5e6, useGSN: true });
            expect(receipt.status).to.equal(true);

            const postTxRecipientFunds = await balance(web3, { recipient: zkAssetGSN.options.address });
            expect(postTxRecipientFunds).to.be.below(initialRecipientFunds);
        });

        it('should send confidentialTransfer() tx via the GSN', async () => {
            const initialRecipientFunds = await balance(web3, { recipient: zkAssetGSN.options.address });

            const depositInputNotes = [];
            const depositOutputNotes = await helpers.getNotesForAccount(aztecAccount, [20, 10]);
            const publicValue = -30;

            const depositProof = new JoinSplitProof(depositInputNotes, depositOutputNotes, sender, publicValue, publicOwner);
            const depositData = depositProof.encodeABI(zkAssetGSN.options.address);
            const signatures = depositProof.constructSignatures(zkAssetGSN.options.address, []);

            await ace.publicApprove(zkAssetGSN.options.address, depositProof.hash, 30, { from: accounts[0] });

            const { receipt } = await zkAssetGSN.methods.confidentialTransfer(depositData, signatures).send({
                from: sender,
                gas: 8e6,
            });
            expect(receipt.status).to.equal(true);

            const postTxRecipientFunds = await balance(web3, { recipient: zkAssetGSN.options.address });
            expect(postTxRecipientFunds).to.be.below(initialRecipientFunds);
        });

        it('should accept all transactions sent', async () => {});
        it('should reject a transaction if recipient funds have been exhausted', async () => {});
    });

    describe('Failure states', async () => {
        it('should reject an unbalanced proof');
    });
});

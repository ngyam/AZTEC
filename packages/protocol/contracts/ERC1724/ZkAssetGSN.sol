pragma solidity >=0.5.0 <0.6.0;

import "openzeppelin-solidity/contracts/GSN/GSNRecipient.sol";

import "./base/ZkAssetBase.sol";

/**
 * @title ZkAssetGSN
 * @author AZTEC
 * @dev A gas station network compatible version of the ZkAsset contract. This enables
 * meta transaction functionality
 * Copyright Spilsbury Holdings Ltd 2019. All rights reserved.
 **/
contract ZkAssetGSN is ZkAssetBase, GSNRecipient {
    constructor(
        address _aceAddress,
        address _linkedTokenAddress,
        uint256 _scalingFactor
    ) public ZkAssetBase(
        _aceAddress,
        _linkedTokenAddress,
        _scalingFactor,
        false // Can adjust supply
    ) {
    }


    function acceptRelayedCall(
        address relay, // address of the relay serving the meta transaction
        address from, // where the relay request originates from
        bytes calldata encodedFunction, // relayed calldata - first four bytes are the function signature
        uint256 transactionFee, // fee paid to the relayer
        uint256 gasPrice, // transaction executed with a gas price of at least this
        uint256 gasLimit, // relayed call is forwaded this amount of gas
        uint256 nonce, // nonce of the from address, to mitigate replay attacks 
        bytes calldata approvalData, // optional data that can contain a signature or other approval based data
        uint256 maxPossibleCharge // max possible charge the recipient will be charged
    ) external view returns(uint256, bytes memory) {
        return _approveRelayedCall(); // approve all transactions
    }


}
pragma solidity >=0.5.0 <0.6.0;

import "./base/ZkAssetGSNBase.sol";

/**
 * @title ZkAssetGSN
 * @author AZTEC
 * @dev A gas station network compatible version of the ZkAsset contract. This enables
 * meta transaction functionality
 * Copyright Spilsbury Holdings Ltd 2019. All rights reserved.
 **/
contract ZkAssetGSN is ZkAssetGSNBase {
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
}
pragma solidity >=0.5.0 <0.6.0;

import "openzeppelin-solidity/contracts/GSN/GSNRecipient.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

import "./ZkAssetBase.sol";

/**
 * @title ZkAssetGSNBase
 * @author AZTEC
 * @dev Base contract for a gas station network compatible ZkAsset. Necessary
 * as msg.sender needs to be replaced with GSNRecipient._msgSender() - 
 * callers of this contract are now the RelayHub rather than directly the users.
 *
 * This contract redefines functions which rely on msg.sender to return the user, and 
 * replaces msg.sender with _msgSender()
 *
 * Copyright Spilsbury Holdings Ltd 2019. All rights reserved.
 **/
contract ZkAssetGSNBase is GSNRecipient, ZkAssetBase {
    using NoteUtils for bytes;
    using SafeMath for uint256;

    event Debug(string placeholder);
    using ProofUtils for uint24;

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


    function preRelayedCall(bytes calldata /*context*/) external returns (bytes32) {
    }

    function postRelayedCall(bytes calldata /*context*/, bool /*success*/, uint /*actualCharge*/, bytes32 /*preRetVal*/) external {
    }

    /**
    * @dev Executes a basic unilateral, confidential transfer of AZTEC notes
    * Will submit _proofData to the validateProof() function of the Cryptography Engine.
    *
    * Upon successfull verification, it will update note registry state - creating output notes and
    * destroying input notes.
    *
    * @param _proofId - id of proof to be validated. Needs to be a balanced proof.
    * @param _proofData - bytes variable outputted from a proof verification contract, representing
    * transfer instructions for the ACE
    * @param _signatures - array of the ECDSA signatures over all inputNotes
    */
    function confidentialTransferTest(uint24 _proofId, bytes memory _proofData, bytes memory _signatures) public {
        emit Debug("inside confidential transfer");
        // Check that it's a balanced proof
        (, uint8 category, ) = _proofId.getProofComponents();

        require(category == uint8(ProofCategory.BALANCED), "this is not a balanced proof");
        bytes memory proofOutputs = ace.validateProof(_proofId, _msgSender(), _proofData);
        confidentialTransferInternal(_proofId, proofOutputs, _signatures, _proofData);
    }

    /**
    * @dev Executes a basic unilateral, confidential transfer of AZTEC notes
    * Will submit _proofData to the validateProof() function of the Cryptography Engine.
    *
    * Upon successfull verification, it will update note registry state - creating output notes and
    * destroying input notes.
    *
    * @param _proofData - bytes variable outputted from a proof verification contract, representing
    * transfer instructions for the ACE
    * @param _signatures - array of the ECDSA signatures over all inputNotes
    */
    function confidentialTransferTest(bytes memory _proofData, bytes memory _signatures) public {
        confidentialTransfer(JOIN_SPLIT_PROOF, _proofData, _signatures);
    }

    /**
    * @dev Perform ECDSA signature validation for a signature over an input note
    *
    * @param _hashStruct - the data to sign in an EIP712 signature
    * @param _noteHash - keccak256 hash of the note coordinates (gamma and sigma)
    * @param _signature - ECDSA signature for a particular input note
    */
    function validateSignature(
        bytes32 _hashStruct,
        bytes32 _noteHash,
        bytes memory _signature
    ) internal view {
        (, , , address noteOwner ) = ace.getNote(address(this), _noteHash);

        address signer;
        if (_signature.length != 0) {
            // validate EIP712 signature
            bytes32 msgHash = hashEIP712Message(_hashStruct);
            signer = recoverSignature(
                msgHash,
                _signature
            );
        } else {
            signer = _msgSender();
        }
        require(signer == noteOwner, "the note owner did not sign this message");
    }

    /**
    * @dev Executes a value transfer mediated by smart contracts. The method is supplied with
    * transfer instructions represented by a bytes _proofOutput argument that was outputted
    * from a proof verification contract.
    *
    * @param _proof - uint24 variable which acts as a unique identifier for the proof which
    * _proofOutput is being submitted. _proof contains three concatenated uint8 variables:
    * 1) epoch number 2) category number 3) ID number for the proof
    * @param _proofOutput - output of a zero-knowledge proof validation contract. Represents
    * transfer instructions for the ACE
    */
    function confidentialTransferFrom(uint24 _proof, bytes memory _proofOutput) public {
        (bytes memory inputNotes,
        bytes memory outputNotes,
        address publicOwner,
        int256 publicValue) = _proofOutput.extractProofOutput();
        
        uint256 length = inputNotes.getLength();
        for (uint i = 0; i < length; i += 1) {
            (, bytes32 noteHash, ) = inputNotes.get(i).extractNote();
            require(
                confidentialApproved[noteHash][_msgSender()] == true,
                "sender does not have approval to spend input note"
            );
        }

        ace.updateNoteRegistry(_proof, _proofOutput, _msgSender());

        logInputNotes(inputNotes);
        logOutputNotes(outputNotes);

        if (publicValue < 0) {
            emit ConvertTokens(publicOwner, uint256(-publicValue));
        }
        if (publicValue > 0) {
            emit RedeemTokens(publicOwner, uint256(publicValue));
        }
    }

    /**
    * @dev Internal method to act on transfer instructions from a successful proof validation.
    * Specifically, it:
    * - extracts the relevant objects from the proofOutput object
    * - validates an EIP712 signature over each input note
    * - updates note registry state
    * - emits events for note creation/destruction
    * - converts or redeems tokens, according to the publicValue
    * @param _proofId - id of proof resulting in _proofData
    * @param proofOutputs - transfer instructions from a zero-knowledege proof validator
    * contract
    * @param _signatures - ECDSA signatures over a set of input notes
    * @param _proofData - cryptographic proof data outputted from a proof construction
    * operation
    */
    function confidentialTransferInternal(
        uint24 _proofId,
        bytes memory proofOutputs,
        bytes memory _signatures,
        bytes memory _proofData
    ) internal {
        bytes32 _challenge;
        assembly {
            _challenge := mload(add(_proofData, 0x40))
        }

        for (uint i = 0; i < proofOutputs.getLength(); i += 1) {
            bytes memory proofOutput = proofOutputs.get(i);
            ace.updateNoteRegistry(_proofId, proofOutput, address(this));

            (bytes memory inputNotes,
            bytes memory outputNotes,
            address publicOwner,
            int256 publicValue) = proofOutput.extractProofOutput();


            if (inputNotes.getLength() > uint(0)) {
                for (uint j = 0; j < inputNotes.getLength(); j += 1) {
                    bytes memory _signature = extractSignature(_signatures, j);

                    (, bytes32 noteHash, ) = inputNotes.get(j).extractNote();

                    bytes32 hashStruct = keccak256(abi.encode(
                        JOIN_SPLIT_SIGNATURE_TYPE_HASH,
                        _proofId,
                        noteHash,
                        _challenge,
                        _msgSender()
                    ));

                    validateSignature(hashStruct, noteHash, _signature);
                }
            }

            logInputNotes(inputNotes);
            logOutputNotes(outputNotes);
            if (publicValue < 0) {
                emit ConvertTokens(publicOwner, uint256(-publicValue));
            }
            if (publicValue > 0) {
                emit RedeemTokens(publicOwner, uint256(publicValue));
            }

        }
    }

    /**
    * @dev Update the metadata of a note that already exists in storage. 
    * @param noteHash - hash of a note, used as a unique identifier for the note
    * @param metaData - metadata to update the note with
    */
    function updateNoteMetaData(bytes32 noteHash, bytes memory metaData) public {
        // Get the note from this assets registry
        ( uint8 status, , , address noteOwner ) = ace.getNote(address(this), noteHash);

        bytes32 addressID = keccak256(abi.encodePacked(_msgSender(), noteHash));
        require(
            (noteAccess[addressID] >= metaDataTimeLog[noteHash] || noteOwner == _msgSender()) && status == 1,
            'caller does not have permission to update metaData'
        );

        // Approve the addresses in the note metaData
        approveAddresses(metaData, noteHash);

        // Set the metaDataTimeLog to the latest block time
        setMetaDataTimeLog(noteHash);

        emit UpdateNoteMetaData(noteOwner, noteHash, metaData);
    }
}




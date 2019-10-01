pragma solidity >=0.5.0 <0.6.0;

import "openzeppelin-solidity/contracts/GSN/GSNRecipient.sol";

contract Counter is GSNRecipient {
  //it keeps a count to demonstrate stage changes
  uint private count;
  address private _owner;

  address public _relayHub = 0xD216153c06E857cD7f72665E0aF1d7D82172F494;


  function getHubAddr() public view returns (address) {
    return _relayHub;
  }

  constructor (uint256 initialCount) public { 
    count = initialCount;
  }

  // accept all requests
  function acceptRelayedCall(
    address,
    address,
    bytes calldata,
    uint256,
    uint256,
    uint256,
    uint256,
    bytes calldata,
    uint256
    ) external view returns (uint256, bytes memory) {
    return _approveRelayedCall();
  }

  function setCounter(uint256 setCount) public {
    count = setCount;
  }

  function owner() public view returns (address) {
    return _owner;
  }

  // getter
  function getCounter() public view returns (uint) {
    return count;
  }

  //and it can add to a count
  function increaseCounter(uint256 amount) public {
    count = count + amount;
  }

  //We'll upgrade the contract with this function after deploying it
  //Function to decrease the counter
  function decreaseCounter(uint256 amount) public returns (bool) {
    require(count > amount, "Cannot be lower than 0");
    count = count - amount;
    return true;
  }

  function setRelayHubAddress() public {
    if(getHubAddr() == address(0)) {
      _upgradeRelayHub(0xD216153c06E857cD7f72665E0aF1d7D82172F494);
    }
  }

  function getRecipientBalance() public view returns (uint) {
    return IRelayHub(getHubAddr()).balanceOf(address(this));
  }

}

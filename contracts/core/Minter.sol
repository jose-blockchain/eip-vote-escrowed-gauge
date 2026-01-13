// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMinter.sol";
import "../interfaces/IGaugeController.sol";

/**
 * @title Minter
 * @notice Mints reward tokens based on gauge weights
 */
contract Minter is IMinter, Ownable {
    uint256 public constant WEEK = 7 days;
    uint256 public constant YEAR = 365 days;
    uint256 public constant INITIAL_RATE = 274_815_283; // ~22.4M per year / (365*86400)
    uint256 public constant RATE_REDUCTION_TIME = YEAR;
    uint256 public constant RATE_REDUCTION_COEFFICIENT = 1189207115002721024; // 2^(1/4) * 1e18
    uint256 public constant RATE_DENOMINATOR = 1e18;
    
    IERC20 public immutable token;
    IGaugeController public immutable controller;
    
    uint256 public rate;
    uint256 public startEpochTime;
    uint256 public startEpochSupply;
    
    mapping(address => uint256) public minted;
    mapping(address => uint256) public lastMintTime;
    
    constructor(address _token, address _controller) Ownable(msg.sender) {
        token = IERC20(_token);
        controller = IGaugeController(_controller);
        rate = INITIAL_RATE;
        startEpochTime = block.timestamp;
    }
    
    /**
     * @notice Update mining rate (can be called once per year)
     */
    function updateMiningParameters() external {
        require(block.timestamp >= startEpochTime + RATE_REDUCTION_TIME, "Too soon");
        
        rate = (rate * RATE_DENOMINATOR) / RATE_REDUCTION_COEFFICIENT;
        startEpochTime += RATE_REDUCTION_TIME;
        startEpochSupply = token.totalSupply();
    }
    
    /**
     * @notice Mint rewards for gauge
     */
    function mint(address gaugeAddr) external {
        _mintFor(gaugeAddr, msg.sender);
    }
    
    /**
     * @notice Get mintable amount for gauge
     */
    function mintable(address gaugeAddr) external view returns (uint256) {
        return _mintable(gaugeAddr);
    }
    
    /**
     * @notice Internal mint function
     */
    function _mintFor(address gaugeAddr, address recipient) internal {
        uint256 mintableAmount = _mintable(gaugeAddr);
        
        if (mintableAmount > 0) {
            minted[gaugeAddr] += mintableAmount;
            lastMintTime[gaugeAddr] = block.timestamp;
            
            // In production, call token.mint(recipient, mintableAmount)
            // For now, assume tokens are pre-minted to this contract
            require(token.transfer(recipient, mintableAmount), "Transfer failed");
            
            emit Minted(gaugeAddr, recipient, mintableAmount);
        }
    }
    
    /**
     * @notice Calculate mintable amount
     */
    function _mintable(address gaugeAddr) internal view returns (uint256) {
        uint256 lastMint = lastMintTime[gaugeAddr];
        if (lastMint == 0) {
            // First time minting - use start epoch time
            lastMint = startEpochTime;
        }
        
        uint256 timeElapsed = block.timestamp - lastMint;
        if (timeElapsed == 0) return 0;
        
        // Get gauge relative weight
        uint256 relativeWeight = controller.gaugeRelativeWeight(gaugeAddr, block.timestamp);
        
        // Calculate total mintable based on emission rate
        uint256 totalMintable = rate * timeElapsed;
        
        // Calculate gauge share
        uint256 gaugeMintable = (totalMintable * relativeWeight) / 1e18;
        
        return gaugeMintable;
    }
}

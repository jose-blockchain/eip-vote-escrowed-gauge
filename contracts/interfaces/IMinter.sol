// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMinter
 * @notice Interface for reward token minting based on gauge weights
 * @dev Handles emission distribution across gauges
 */
interface IMinter {
    /**
     * @notice Mint rewards for a gauge
     * @param gaugeAddr Gauge to mint for
     */
    function mint(address gaugeAddr) external;
    
    /**
     * @notice Get mintable amount for gauge
     * @param gaugeAddr Gauge address
     * @return Mintable amount
     */
    function mintable(address gaugeAddr) external view returns (uint256);
    
    /**
     * @notice Get minted amount for gauge in current period
     * @param gaugeAddr Gauge address
     * @return Minted amount
     */
    function minted(address gaugeAddr) external view returns (uint256);
    
    /**
     * @notice Get emission rate per second
     * @return Emission rate
     */
    function rate() external view returns (uint256);
    
    /**
     * @notice Update mining parameters (emission rate)
     */
    function updateMiningParameters() external;
    
    /**
     * @notice Emitted when rewards are minted
     * @param gauge Gauge address
     * @param recipient Recipient address
     * @param amount Amount minted
     */
    event Minted(address indexed gauge, address indexed recipient, uint256 amount);
}

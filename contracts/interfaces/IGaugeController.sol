// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGaugeController
 * @notice Interface for managing gauge weights through voting
 * @dev Coordinates voting power allocation across multiple gauges
 */
interface IGaugeController {
    /**
     * @notice Add a new gauge
     * @param addr Gauge address
     * @param gaugeType Gauge type identifier
     */
    function addGauge(address addr, uint256 gaugeType) external;
    
    /**
     * @notice Vote for gauge weight allocation
     * @param gaugeAddr Gauge address to vote for
     * @param weight Weight to assign (basis points, 0-10000)
     */
    function voteForGaugeWeights(address gaugeAddr, uint256 weight) external;
    
    /**
     * @notice Get relative weight of a gauge at current time
     * @param addr Gauge address
     * @return Relative weight (1e18 = 100%)
     */
    function gaugeRelativeWeight(address addr) external view returns (uint256);
    
    /**
     * @notice Get relative weight at specific timestamp
     * @param addr Gauge address
     * @param timestamp Time to query
     * @return Relative weight (1e18 = 100%)
     */
    function gaugeRelativeWeight(address addr, uint256 timestamp) external view returns (uint256);
    
    /**
     * @notice Get gauge type
     * @param addr Gauge address
     * @return Gauge type
     */
    function gaugeTypes(address addr) external view returns (uint256);
    
    /**
     * @notice Checkpoint to update all gauge weights
     */
    function checkpoint() external;
    
    /**
     * @notice Checkpoint specific gauge
     * @param addr Gauge address
     */
    function checkpointGauge(address addr) external;
    
    /**
     * @notice Get last user vote time for gauge
     * @param user User address
     * @param gauge Gauge address
     * @return Last vote timestamp
     */
    function lastUserVote(address user, address gauge) external view returns (uint256);
    
    /**
     * @notice Get user's vote power for specific gauge
     * @param user User address
     * @param gauge Gauge address
     * @return Vote power allocated to gauge
     */
    function voteUserPower(address user, address gauge) external view returns (uint256);
    
    /**
     * @notice Emitted when new gauge is added
     * @param gauge Gauge address
     * @param gaugeType Type identifier
     */
    event NewGauge(address indexed gauge, uint256 gaugeType);
    
    /**
     * @notice Emitted when user votes
     * @param user Voter address
     * @param gauge Gauge address
     * @param weight Vote weight
     * @param timestamp Block timestamp
     */
    event VoteForGauge(address indexed user, address indexed gauge, uint256 weight, uint256 timestamp);
}

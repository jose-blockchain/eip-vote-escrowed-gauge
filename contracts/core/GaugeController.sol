// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IGaugeController.sol";
import "../interfaces/IVotingEscrow.sol";

/**
 * @title GaugeController
 * @notice Manages gauge registration and vote-based weight distribution
 */
contract GaugeController is IGaugeController, Ownable {
    uint256 public constant WEEK = 7 days;
    uint256 public constant WEIGHT_VOTE_DELAY = 10 days;
    uint256 public constant MULTIPLIER = 1e18;
    
    struct Point {
        uint256 bias;
        uint256 slope;
    }
    
    struct VotedSlope {
        uint256 slope;
        uint256 power;
        uint256 end;
    }
    
    IVotingEscrow public immutable votingEscrow;
    
    uint256 public nGauges;
    uint256 public nGaugeTypes;
    
    mapping(address => uint256) public gaugeTypes_;
    mapping(address => uint256) public gaugeRelativeWeight_;
    mapping(address => mapping(uint256 => Point)) public pointsWeight;
    mapping(address => mapping(uint256 => uint256)) public changesWeight;
    mapping(address => uint256) public timeWeight;
    
    mapping(uint256 => Point) public pointsSum;
    mapping(uint256 => mapping(uint256 => uint256)) public changesSum;
    uint256 public timeSum;
    
    mapping(address => mapping(address => VotedSlope)) public voteUserSlopes;
    mapping(address => uint256) public userPowerUsed;
    mapping(address => mapping(address => uint256)) public lastUserVote;
    
    mapping(address => uint256) public gaugeTypeIndex;
    
    constructor(address _votingEscrow) Ownable(msg.sender) {
        votingEscrow = IVotingEscrow(_votingEscrow);
        timeSum = (block.timestamp / WEEK) * WEEK;
    }
    
    /**
     * @notice Add a new gauge (admin only)
     */
    function addGauge(address addr, uint256 gaugeType) external onlyOwner {
        require(gaugeTypes_[addr] == 0, "Gauge already exists");
        require(gaugeType <= nGaugeTypes, "Invalid gauge type");
        
        gaugeTypes_[addr] = gaugeType + 1; // +1 to distinguish from default 0
        
        uint256 nextTime = ((block.timestamp + WEEK) / WEEK) * WEEK;
        timeWeight[addr] = nextTime;
        
        nGauges++;
        
        emit NewGauge(addr, gaugeType);
    }
    
    /**
     * @notice Add new gauge type (admin only)
     */
    function addGaugeType(string memory _name) external onlyOwner {
        nGaugeTypes++;
    }
    
    /**
     * @notice Checkpoint to update gauge weights
     */
    function checkpoint() public {
        _updateAllGauges();
    }
    
    /**
     * @notice Checkpoint specific gauge
     */
    function checkpointGauge(address addr) external {
        _getWeight(addr);
        _getTotal();
    }
    
    /**
     * @notice Vote for gauge weights
     * @param gaugeAddr Gauge to vote for
     * @param userWeight Weight in basis points (10000 = 100%)
     */
    function voteForGaugeWeights(address gaugeAddr, uint256 userWeight) external {
        require(gaugeTypes_[gaugeAddr] != 0, "Gauge does not exist");
        require(userWeight <= 10000, "Weight > 100%");
        require(
            block.timestamp >= lastUserVote[msg.sender][gaugeAddr] + WEIGHT_VOTE_DELAY,
            "Vote too soon"
        );
        
        uint256 newSlope = uint256(uint128(votingEscrow.balanceOf(msg.sender))) * userWeight / 10000;
        // Allow 0 weight votes to remove existing votes
        if (userWeight > 0) {
            require(newSlope > 0, "No voting power");
        }
        
        (, uint256 lockEnd) = votingEscrow.locked(msg.sender);
        require(lockEnd > block.timestamp, "Lock expired");
        
        uint256 nextTime = ((block.timestamp + WEEK) / WEEK) * WEEK;
        uint256 newBias = newSlope * (lockEnd - nextTime) / WEEK;
        
        // Initialize time slots
        _initializeTimeSlots(gaugeAddr, nextTime);
        
        VotedSlope storage oldVote = voteUserSlopes[msg.sender][gaugeAddr];
        uint256 oldBias = oldVote.slope * (lockEnd - nextTime) / WEEK;
        
        userPowerUsed[msg.sender] = userPowerUsed[msg.sender] - oldVote.power + userWeight;
        require(userPowerUsed[msg.sender] <= 10000, "Used too much power");
        
        // Update weights
        _updateWeights(gaugeAddr, nextTime, oldBias, newBias, oldVote.slope, newSlope);
        
        // Update slope changes
        _updateSlopeChanges(gaugeAddr, oldVote.slope, oldVote.end, newSlope, lockEnd);
        
        // Update time pointers
        if (timeWeight[gaugeAddr] < nextTime) timeWeight[gaugeAddr] = nextTime;
        if (timeSum < nextTime) timeSum = nextTime;
        
        oldVote.slope = newSlope;
        oldVote.power = userWeight;
        oldVote.end = lockEnd;
        
        lastUserVote[msg.sender][gaugeAddr] = block.timestamp;
        emit VoteForGauge(msg.sender, gaugeAddr, userWeight, block.timestamp);
    }
    
    function _initializeTimeSlots(address gaugeAddr, uint256 nextTime) internal {
        // Only copy forward if there's actual data to copy
        if (nextTime > timeSum && pointsSum[nextTime].bias == 0 && pointsSum[timeSum].bias > 0) {
            pointsSum[nextTime] = pointsSum[timeSum];
        }
        uint256 prevTimeWeight = timeWeight[gaugeAddr];
        if (nextTime > prevTimeWeight && pointsWeight[gaugeAddr][nextTime].bias == 0 && pointsWeight[gaugeAddr][prevTimeWeight].bias > 0) {
            pointsWeight[gaugeAddr][nextTime] = pointsWeight[gaugeAddr][prevTimeWeight];
        }
    }
    
    function _updateWeights(address gaugeAddr, uint256 nextTime, uint256 oldBias, uint256 newBias, uint256 oldSlope, uint256 newSlope) internal {
        // Update bias
        if (newBias >= oldBias) {
            pointsWeight[gaugeAddr][nextTime].bias += (newBias - oldBias);
            pointsSum[nextTime].bias += (newBias - oldBias);
        } else {
            uint256 diff = oldBias - newBias;
            pointsWeight[gaugeAddr][nextTime].bias = pointsWeight[gaugeAddr][nextTime].bias > diff ? pointsWeight[gaugeAddr][nextTime].bias - diff : 0;
            pointsSum[nextTime].bias = pointsSum[nextTime].bias > diff ? pointsSum[nextTime].bias - diff : 0;
        }
        
        // Update slope
        if (newSlope >= oldSlope) {
            pointsWeight[gaugeAddr][nextTime].slope += (newSlope - oldSlope);
            pointsSum[nextTime].slope += (newSlope - oldSlope);
        } else {
            uint256 diff = oldSlope - newSlope;
            pointsWeight[gaugeAddr][nextTime].slope = pointsWeight[gaugeAddr][nextTime].slope > diff ? pointsWeight[gaugeAddr][nextTime].slope - diff : 0;
            pointsSum[nextTime].slope = pointsSum[nextTime].slope > diff ? pointsSum[nextTime].slope - diff : 0;
        }
    }
    
    function _updateSlopeChanges(address gaugeAddr, uint256 oldSlope, uint256 oldEnd, uint256 newSlope, uint256 lockEnd) internal {
        uint256 gaugeType = gaugeTypes_[gaugeAddr] - 1;
        
        if (oldSlope > 0 && oldEnd > 0) {
            if (changesWeight[gaugeAddr][oldEnd] >= oldSlope) {
                changesWeight[gaugeAddr][oldEnd] -= oldSlope;
            }
            if (changesSum[gaugeType][oldEnd] >= oldSlope) {
                changesSum[gaugeType][oldEnd] -= oldSlope;
            }
        }
        
        changesWeight[gaugeAddr][lockEnd] += newSlope;
        changesSum[gaugeType][lockEnd] += newSlope;
    }
    
    /**
     * @notice Get relative weight for gauge at current time
     */
    function gaugeRelativeWeight(address addr) external view returns (uint256) {
        return gaugeRelativeWeight(addr, block.timestamp);
    }
    
    /**
     * @notice Get relative weight at specific time
     */
    function gaugeRelativeWeight(address addr, uint256 time) public view returns (uint256) {
        uint256 t = (time / WEEK) * WEEK;
        
        // Get gauge weight at time t (with decay calculation)
        uint256 gaugeWeight = _getWeightView(addr, t);
        uint256 total = _getTotalView(t);
        
        if (total == 0) return 0;
        return MULTIPLIER * gaugeWeight / total;
    }
    
    /**
     * @notice View function to calculate gauge weight at a specific time
     * @dev Returns the stored weight, decayed to the query time
     */
    function _getWeightView(address gaugeAddr, uint256 t) internal view returns (uint256) {
        uint256 tWeight = timeWeight[gaugeAddr];
        if (tWeight == 0) return 0;
        
        // Get the stored point
        Point memory pt = pointsWeight[gaugeAddr][tWeight];
        if (pt.bias == 0) return 0;
        
        // Calculate decay from stored time to query time
        uint256 queryTime = (t / WEEK) * WEEK;
        
        // If query is before the vote was stored, return 0
        if (queryTime < tWeight) return 0;
        
        // No decay needed if same time
        if (queryTime == tWeight) return pt.bias;
        
        // Decay forward - slope is per WEEK, so divide elapsed by WEEK
        uint256 elapsed = queryTime - tWeight;
        uint256 decay = (pt.slope * elapsed) / WEEK;
        
        if (pt.bias > decay) {
            return pt.bias - decay;
        }
        return 0;
    }
    
    /**
     * @notice View function to calculate total weight at a specific time
     */
    function _getTotalView(uint256 t) internal view returns (uint256) {
        if (timeSum == 0) return 0;
        
        Point memory pt = pointsSum[timeSum];
        if (pt.bias == 0) return 0;
        
        uint256 queryTime = (t / WEEK) * WEEK;
        
        // If query is before any votes, return 0
        if (queryTime < timeSum) return 0;
        
        // No decay needed if same time
        if (queryTime == timeSum) return pt.bias;
        
        // Decay forward - slope is per WEEK, so divide elapsed by WEEK
        uint256 elapsed = queryTime - timeSum;
        uint256 decay = (pt.slope * elapsed) / WEEK;
        
        if (pt.bias > decay) {
            return pt.bias - decay;
        }
        return 0;
    }
    
    /**
     * @notice Get gauge type
     */
    function gaugeTypes(address addr) external view returns (uint256) {
        uint256 gaugeType = gaugeTypes_[addr];
        require(gaugeType != 0, "Gauge does not exist");
        return gaugeType - 1;
    }

    /**
     * @notice Get user's vote power for specific gauge
     */
    function voteUserPower(address user, address gauge) external view returns (uint256) {
        return voteUserSlopes[user][gauge].power;
    }
    
    function _getWeight(address gaugeAddr) internal returns (uint256) {
        uint256 t = timeWeight[gaugeAddr];
        if (t > 0) {
            Point memory pt = pointsWeight[gaugeAddr][t];
            for (uint256 i = 0; i < 500; i++) {
                if (t > block.timestamp) break;
                t += WEEK;
                uint256 dBias = pt.slope * WEEK;
                if (pt.bias > dBias) {
                    pt.bias -= dBias;
                    uint256 dSlope = changesWeight[gaugeAddr][t];
                    pt.slope -= dSlope;
                } else {
                    pt.bias = 0;
                    pt.slope = 0;
                }
                pointsWeight[gaugeAddr][t] = pt;
                if (t > block.timestamp) timeWeight[gaugeAddr] = t;
            }
            return pt.bias;
        }
        return 0;
    }
    
    function _getTotal() internal returns (uint256) {
        uint256 t = timeSum;
        if (t > block.timestamp) t = (block.timestamp / WEEK) * WEEK;
        Point memory pt = pointsSum[t];
        
        for (uint256 gaugeType = 0; gaugeType < 500; gaugeType++) {
            if (gaugeType == nGaugeTypes) break;
            
            for (uint256 i = 0; i < 500; i++) {
                if (t > block.timestamp) break;
                t += WEEK;
                uint256 dBias = pt.slope * WEEK;
                if (pt.bias > dBias) {
                    pt.bias -= dBias;
                    uint256 dSlope = changesSum[gaugeType][t];
                    pt.slope -= dSlope;
                } else {
                    pt.bias = 0;
                    pt.slope = 0;
                }
                pointsSum[t] = pt;
                if (t > block.timestamp) {
                    timeSum = t;
                }
            }
        }
        return pt.bias;
    }
    
    function _updateAllGauges() internal {
        for (uint256 i = 0; i < nGauges; i++) {
            // In production, maintain array of gauge addresses
        }
    }
}

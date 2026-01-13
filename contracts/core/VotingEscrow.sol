// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IVotingEscrow.sol";

/**
 * @title VotingEscrow
 * @notice Vote-escrowed token with time-weighted voting power
 * @dev Locks tokens for up to MAX_TIME, voting power decays linearly to unlock
 */
contract VotingEscrow is IVotingEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct Point {
        int128 bias;      // Voting power
        int128 slope;     // Decay rate
        uint256 ts;       // Timestamp
        uint256 blk;      // Block number
    }
    
    struct LockedBalance {
        uint256 amount;
        uint256 end;
    }
    
    uint256 public constant WEEK = 7 days;
    uint256 public constant MAX_TIME = 4 * 365 days; // 4 years
    uint256 public constant MULTIPLIER = 1e18;
    
    IERC20 public immutable token;
    string public name;
    string public symbol;
    
    mapping(address => LockedBalance) public locked;
    
    uint256 public epoch;
    mapping(uint256 => Point) public pointHistory;
    mapping(address => mapping(uint256 => Point)) public userPointHistory;
    mapping(address => uint256) public userPointEpoch;
    
    mapping(uint256 => int128) public slopeChanges;
    
    
    constructor(address _token, string memory _name, string memory _symbol) {
        token = IERC20(_token);
        name = _name;
        symbol = _symbol;
        
        pointHistory[0] = Point({
            bias: 0,
            slope: 0,
            ts: block.timestamp,
            blk: block.number
        });
    }
    
    /**
     * @notice Create a new lock
     * @param amount Amount to lock
     * @param unlockTime Unlock timestamp (rounded down to weeks)
     */
    function createLock(uint256 amount, uint256 unlockTime) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        
        LockedBalance memory _locked = locked[msg.sender];
        require(_locked.amount == 0, "Lock already exists");
        
        unlockTime = (unlockTime / WEEK) * WEEK; // Round down to week
        require(unlockTime > block.timestamp, "Unlock time must be in future");
        require(unlockTime <= block.timestamp + MAX_TIME, "Unlock time too far");
        
        _depositFor(msg.sender, amount, unlockTime, _locked, 0);
        
        token.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @notice Increase locked amount
     * @param amount Additional amount to lock
     */
    function increaseAmount(uint256 amount) external nonReentrant {
        LockedBalance memory _locked = locked[msg.sender];
        require(_locked.amount > 0, "No existing lock");
        require(_locked.end > block.timestamp, "Lock expired");
        require(amount > 0, "Amount must be > 0");
        
        _depositFor(msg.sender, amount, 0, _locked, 1);
        
        token.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @notice Extend unlock time
     * @param unlockTime New unlock timestamp
     */
    function increaseUnlockTime(uint256 unlockTime) external nonReentrant {
        LockedBalance memory _locked = locked[msg.sender];
        require(_locked.amount > 0, "No existing lock");
        require(_locked.end > block.timestamp, "Lock expired");
        
        unlockTime = (unlockTime / WEEK) * WEEK;
        require(unlockTime > _locked.end, "Can only increase lock duration");
        require(unlockTime <= block.timestamp + MAX_TIME, "Unlock time too far");
        
        _depositFor(msg.sender, 0, unlockTime, _locked, 2);
    }
    
    /**
     * @notice Withdraw all tokens after lock expiry
     */
    function withdraw() external nonReentrant {
        LockedBalance memory _locked = locked[msg.sender];
        require(_locked.end <= block.timestamp, "Lock not expired");
        uint256 value = _locked.amount;
        
        LockedBalance memory oldLocked = _locked;
        _locked.amount = 0;
        _locked.end = 0;
        locked[msg.sender] = _locked;
        
        _checkpoint(msg.sender, oldLocked, _locked);
        
        token.safeTransfer(msg.sender, value);
        
        emit Withdraw(msg.sender, value, block.timestamp);
    }
    
    /**
     * @notice Get current voting power for address
     */
    function balanceOf(address addr) external view returns (uint256) {
        return balanceOf(addr, block.timestamp);
    }
    
    /**
     * @notice Get voting power at specific timestamp
     */
    function balanceOf(address addr, uint256 timestamp) public view returns (uint256) {
        uint256 _epoch = userPointEpoch[addr];
        if (_epoch == 0) return 0;
        
        Point memory lastPoint = userPointHistory[addr][_epoch];
        lastPoint.bias -= lastPoint.slope * int128(int256(timestamp - lastPoint.ts));
        if (lastPoint.bias < 0) lastPoint.bias = 0;
        
        return uint256(uint128(lastPoint.bias));
    }
    
    /**
     * @notice Get total voting power
     */
    function totalSupply() external view returns (uint256) {
        return totalSupply(block.timestamp);
    }
    
    /**
     * @notice Get total voting power at timestamp
     */
    function totalSupply(uint256 timestamp) public view returns (uint256) {
        uint256 _epoch = epoch;
        if (_epoch == 0) return 0;
        
        Point memory lastPoint = pointHistory[_epoch];
        return _supplyAt(lastPoint, timestamp);
    }
    
    function _supplyAt(Point memory point, uint256 t) internal view returns (uint256) {
        Point memory lastPoint = point;
        uint256 ti = (lastPoint.ts / WEEK) * WEEK;
        
        for (uint256 i = 0; i < 255; i++) {
            ti += WEEK;
            int128 dSlope = 0;
            if (ti > t) {
                ti = t;
            } else {
                dSlope = slopeChanges[ti];
            }
            lastPoint.bias -= lastPoint.slope * int128(int256(ti - lastPoint.ts));
            if (ti == t) break;
            lastPoint.slope += dSlope;
            lastPoint.ts = ti;
        }
        
        if (lastPoint.bias < 0) lastPoint.bias = 0;
        return uint256(uint128(lastPoint.bias));
    }
    
    function _depositFor(
        address addr,
        uint256 value,
        uint256 unlockTime,
        LockedBalance memory lockedBalance,
        uint256 depositType
    ) internal {
        // Save old locked state BEFORE modifying (must create explicit copy)
        LockedBalance memory oldLocked = LockedBalance({
            amount: lockedBalance.amount,
            end: lockedBalance.end
        });
        LockedBalance memory _locked = LockedBalance({
            amount: lockedBalance.amount,
            end: lockedBalance.end
        });
        
        if (value != 0) {
            _locked.amount += value;
        }
        if (unlockTime != 0) {
            _locked.end = unlockTime;
        }
        locked[addr] = _locked;
        
        _checkpoint(addr, oldLocked, _locked);
        
        if (value != 0) {
            emit Deposit(addr, value, _locked.end, block.timestamp);
        }
    }
    
    function _checkpoint(
        address addr,
        LockedBalance memory oldLocked,
        LockedBalance memory newLocked
    ) internal {
        Point memory uOld = Point({bias: 0, slope: 0, ts: 0, blk: 0});
        Point memory uNew = Point({bias: 0, slope: 0, ts: 0, blk: 0});
        int128 oldDslope = 0;
        int128 newDslope = 0;
        
        if (addr != address(0)) {
            if (oldLocked.end > block.timestamp && oldLocked.amount > 0) {
                uOld.slope = int128(int256(oldLocked.amount / MAX_TIME));
                uOld.bias = uOld.slope * int128(int256(oldLocked.end - block.timestamp));
            }
            if (newLocked.end > block.timestamp && newLocked.amount > 0) {
                uNew.slope = int128(int256(newLocked.amount / MAX_TIME));
                uNew.bias = uNew.slope * int128(int256(newLocked.end - block.timestamp));
            }
            
            oldDslope = slopeChanges[oldLocked.end];
            if (newLocked.end != 0) {
                if (newLocked.end == oldLocked.end) {
                    newDslope = oldDslope;
                } else {
                    newDslope = slopeChanges[newLocked.end];
                }
            }
        }
        
        Point memory lastPoint = Point({bias: 0, slope: 0, ts: block.timestamp, blk: block.number});
        if (epoch > 0) {
            lastPoint = pointHistory[epoch];
        }
        uint256 lastCheckpoint = lastPoint.ts;
        
        Point memory initialLastPoint = lastPoint;
        uint256 blockSlope = 0;
        if (block.timestamp > lastPoint.ts) {
            blockSlope = (MULTIPLIER * (block.number - lastPoint.blk)) / (block.timestamp - lastPoint.ts);
        }
        
        uint256 ti = (lastCheckpoint / WEEK) * WEEK;
        for (uint256 i = 0; i < 255; i++) {
            ti += WEEK;
            int128 dSlope = 0;
            if (ti > block.timestamp) {
                ti = block.timestamp;
            } else {
                dSlope = slopeChanges[ti];
            }
            lastPoint.bias -= lastPoint.slope * int128(int256(ti - lastCheckpoint));
            lastPoint.slope += dSlope;
            if (lastPoint.bias < 0) lastPoint.bias = 0;
            if (lastPoint.slope < 0) lastPoint.slope = 0;
            lastCheckpoint = ti;
            lastPoint.ts = ti;
            lastPoint.blk = initialLastPoint.blk + (blockSlope * (ti - initialLastPoint.ts)) / MULTIPLIER;
            epoch += 1;
            
            if (ti == block.timestamp) {
                lastPoint.blk = block.number;
                pointHistory[epoch] = lastPoint;
                break;
            } else {
                pointHistory[epoch] = lastPoint;
            }
        }
        
        // Add user's contribution to the global point
        if (addr != address(0)) {
            lastPoint.slope += (uNew.slope - uOld.slope);
            lastPoint.bias += (uNew.bias - uOld.bias);
            if (lastPoint.slope < 0) lastPoint.slope = 0;
            if (lastPoint.bias < 0) lastPoint.bias = 0;
            pointHistory[epoch] = lastPoint;
        }
        
        if (addr != address(0)) {
            if (oldLocked.end > block.timestamp) {
                oldDslope += uOld.slope;
                if (newLocked.end == oldLocked.end) {
                    oldDslope -= uNew.slope;
                }
                slopeChanges[oldLocked.end] = oldDslope;
            }
            if (newLocked.end > block.timestamp) {
                if (newLocked.end > oldLocked.end) {
                    newDslope -= uNew.slope;
                    slopeChanges[newLocked.end] = newDslope;
                }
            }
            
            uint256 userEpoch = userPointEpoch[addr] + 1;
            userPointEpoch[addr] = userEpoch;
            uNew.ts = block.timestamp;
            uNew.blk = block.number;
            userPointHistory[addr][userEpoch] = uNew;
        }
    }
}

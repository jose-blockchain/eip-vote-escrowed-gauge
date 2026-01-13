// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVotingEscrow
 * @notice Interface for vote-escrowed token contracts
 * @dev Time-locked tokens that provide voting power based on lock duration
 */
interface IVotingEscrow {
    /**
     * @notice Lock tokens to receive voting power
     * @param amount Amount of tokens to lock
     * @param unlockTime Timestamp when tokens can be withdrawn
     */
    function createLock(uint256 amount, uint256 unlockTime) external;
    
    /**
     * @notice Increase the amount of locked tokens
     * @param amount Additional amount to lock
     */
    function increaseAmount(uint256 amount) external;
    
    /**
     * @notice Extend lock duration
     * @param unlockTime New unlock timestamp (must be greater than current)
     */
    function increaseUnlockTime(uint256 unlockTime) external;
    
    /**
     * @notice Withdraw all tokens after lock expires
     */
    function withdraw() external;
    
    /**
     * @notice Get voting power at a specific timestamp
     * @param addr User address
     * @param timestamp Timestamp to query
     * @return Voting power (veToken balance)
     */
    function balanceOf(address addr, uint256 timestamp) external view returns (uint256);
    
    /**
     * @notice Get current voting power
     * @param addr User address
     * @return Current voting power
     */
    function balanceOf(address addr) external view returns (uint256);
    
    /**
     * @notice Get total voting power at timestamp
     * @param timestamp Timestamp to query
     * @return Total voting power
     */
    function totalSupply(uint256 timestamp) external view returns (uint256);
    
    /**
     * @notice Get total current voting power
     * @return Total voting power
     */
    function totalSupply() external view returns (uint256);
    
    /**
     * @notice Get locked balance info for user
     * @param addr User address
     * @return amount Locked amount
     * @return end Unlock timestamp
     */
    function locked(address addr) external view returns (uint256 amount, uint256 end);
    
    /**
     * @notice Emitted when tokens are locked
     * @param provider User address
     * @param value Amount locked
     * @param unlockTime Unlock timestamp
     * @param timestamp Block timestamp
     */
    event Deposit(address indexed provider, uint256 value, uint256 unlockTime, uint256 timestamp);
    
    /**
     * @notice Emitted when tokens are withdrawn
     * @param provider User address
     * @param value Amount withdrawn
     * @param timestamp Block timestamp
     */
    event Withdraw(address indexed provider, uint256 value, uint256 timestamp);
}

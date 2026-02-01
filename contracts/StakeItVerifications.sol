// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract StakeItVerifications {

    struct Verification {
        string goalId;
        uint256 weekNumber;
        bool passed;
        string proofValue;
        uint256 timestamp;
        address recorder;
    }

    Verification[] public verifications;
    mapping(bytes32 => uint256) public verificationIndex;
    mapping(string => uint256) public goalVerificationCount;
    mapping(string => uint256) public goalPassedCount;

    event VerificationRecorded(
        uint256 indexed index,
        string goalId,
        uint256 weekNumber,
        bool passed,
        string proofValue,
        uint256 timestamp
    );

    function recordVerification(
        string calldata goalId,
        uint256 weekNumber,
        bool passed,
        string calldata proofValue
    ) external {
        bytes32 key = keccak256(abi.encodePacked(goalId, weekNumber));
        require(verificationIndex[key] == 0, "Already recorded");

        Verification memory v = Verification({
            goalId: goalId,
            weekNumber: weekNumber,
            passed: passed,
            proofValue: proofValue,
            timestamp: block.timestamp,
            recorder: msg.sender
        });

        verifications.push(v);
        uint256 index = verifications.length;
        verificationIndex[key] = index;

        goalVerificationCount[goalId]++;
        if (passed) {
            goalPassedCount[goalId]++;
        }

        emit VerificationRecorded(index - 1, goalId, weekNumber, passed, proofValue, block.timestamp);
    }

    function getVerification(string calldata goalId, uint256 weekNumber)
        external view returns (bool exists, bool passed, string memory proofValue, uint256 timestamp)
    {
        bytes32 key = keccak256(abi.encodePacked(goalId, weekNumber));
        uint256 index = verificationIndex[key];

        if (index == 0) return (false, false, "", 0);

        Verification memory v = verifications[index - 1];
        return (true, v.passed, v.proofValue, v.timestamp);
    }

    function getTotalVerifications() external view returns (uint256) {
        return verifications.length;
    }

    function getGoalStats(string calldata goalId) external view returns (uint256 total, uint256 passed) {
        return (goalVerificationCount[goalId], goalPassedCount[goalId]);
    }
}

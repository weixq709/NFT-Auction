// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// 导入 Chainlink 标准接口
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title 模拟Chainlink价格预言机
 * @notice 完全实现AggregatorV3Interface，可在测试中手动控制喂价
 */
contract MockOracle is AggregatorV3Interface {
    // 最新价格数据
    int256 private _latestAnswer;
    uint256 private _latestTimestamp;
    uint256 private _latestRound;

    // 链link喂价数据精度（通常为8位小数）
    uint8 public constant override decimals = 8;
    // 描述信息
    string public constant override description = "Mock Oracle for Testing";
    // 版本号
    uint256 public constant override version = 1;

    // 事件：当价格更新时发出
    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
    event NewRound(uint256 indexed roundId, address indexed startedBy, uint256 startedAt);

    /**
     * @notice 构造函数，可初始化价格
     * @param initialPrice 初始价格（带8位小数，如 3000 * 10^8 代表 $3000）
     */
    constructor(int256 initialPrice) {
        _latestAnswer = initialPrice;
        _latestTimestamp = block.timestamp;
        _latestRound = 1;
    }

    /**
     * @notice 手动设置最新价格（核心测试方法）
     * @param price 新价格（带8位小数）
     */
    function setPrice(int256 price) external {
        _latestAnswer = price;
        _latestTimestamp = block.timestamp;
        _latestRound += 1;
        
        emit AnswerUpdated(price, _latestRound, _latestTimestamp);
        emit NewRound(_latestRound, msg.sender, _latestTimestamp);
    }

    /**
     * @notice 获取最新价格数据
     * @return roundId 轮次ID
     * @return answer 最新价格
     * @return startedAt 价格更新时间戳
     * @return updatedAt 同上（Chainlink接口要求）
     * @return answeredInRound 回答的轮次ID
     */
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        roundId = uint80(_latestRound);
        answer = _latestAnswer;
        startedAt = _latestTimestamp;
        updatedAt = _latestTimestamp;
        answeredInRound = uint80(_latestRound);
    }

    /**
     * @notice 获取特定轮次的价格数据（本模拟器仅支持最新轮次）
     */
    function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        // 本模拟版本简单返回最新数据
        require(_roundId <= _latestRound, "Round not found");
        
        roundId = uint80(_latestRound);
        answer = _latestAnswer;
        startedAt = _latestTimestamp;
        updatedAt = _latestTimestamp;
        answeredInRound = uint80(_latestRound);
    }

    /**
     * @notice 获取最新价格（兼容旧接口）
     */
    function latestAnswer() external view returns (int256) {
        return _latestAnswer;
    }

    /**
     * @notice 获取最新时间戳（兼容旧接口）
     */
    function latestTimestamp() external view returns (uint256) {
        return _latestTimestamp;
    }

    /**
     * @notice 获取最新轮次ID（兼容旧接口）
     */
    function latestRound() external view returns (uint256) {
        return _latestRound;
    }
}
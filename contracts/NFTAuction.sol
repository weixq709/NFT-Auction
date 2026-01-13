// SPDX-License-Identifier: MIT 
pragma solidity >=0.8.20;

import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NFTAuction is IERC721Receiver, Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {

    /**
     * @dev 开始拍卖事件
     * @param seller 出售方地址
     * @param tokenId 代币ID
     * @param nftContract 代币地址
     * @param duration 拍卖持续时间（秒）
     * @param actionId 拍卖ID
     */
    event ActionCreated(address indexed seller, uint256 indexed tokenId, address nftContract, uint256 duration, uint256 actionId);

    /**
     * @dev 用户竞拍事件
     * @param bidder 竞拍人
     * @param price 竞拍价格
     * @param payToken 支付代币地址
     */
    event BidPlaced(address indexed bidder, uint256 price, address payToken);

    /**
     * @dev 结束拍卖事件
     * @param receiver 拍卖接收人
     * @param tokenId 代币ID
     * @param price 成交价格
     * @param payToken 支付代币地址
     */
    event ActionEnd(address indexed receiver, uint256 indexed tokenId, uint256 indexed price, address payToken);

    /**
     * @dev 竞拍失败
     * @param highestPrice 当前最高价格
     * @param payToken 最高价格代币类型
     */
    error BidFailure(uint256 highestPrice, address payToken);

    // 拍卖信息
    struct ActionInfo {
        // 卖家
        address seller;
        // 开始时间
        uint256 startTime;
        // 持续时间，单位（秒）
        uint256 duration;
        // 是否结束
        bool ended;
        // 最高出价人
        address highestBidder;
        // 最高价格
        uint256 highestPrice;
        // 起拍价格
        uint256 startPrice;
        // 代币地址
        address tokenContract;
        // tokenId
        uint256 tokenId;
        // 支付代币
        address payToken;
        // 拍卖ID
        uint256 actionId;
    }

    ActionInfo action;

    // 价格预言机，支持多中币种
    mapping(address token => AggregatorV3Interface) priceFeeds;

    // 支持的代币种类
    address[] supportTokens;

    modifier onlySeller {
        require(action.seller == msg.sender, "only seller");
        _;
    }

    function initialize(
        address seller,
        address admin,
        address tokenAddress,
        uint256 delay, 
        uint256 duration,
        uint256 startPrice,
        uint256 tokenId,
        uint256 actionId) public initializer {
   
        __Ownable_init(admin);
        __ReentrancyGuard_init();
        
        // 卖家地址不能是0地址
        require(seller != address(0), "invalid seller");
        // NFT地址不能是0地址
        require(tokenAddress != address(0), "invalid token address");
        // 持续时间必须大于0
        require(duration > 0, "duration must be greater than zero");
        // 起拍价格必须大于0
        require(startPrice > 0, "startPrice must be greater than zero");
        require(tokenId > 0, "tokenId must be greater than zero");

        // 构建拍卖信息
        action = ActionInfo({
            seller: seller,
            startTime: block.timestamp + delay,
            duration: duration,
            ended: false,
            highestBidder: address(0),
            highestPrice: 0,
            startPrice: startPrice,
            tokenContract: tokenAddress,
            tokenId: tokenId,
            payToken: address(0), // 起拍价为ETH，单位为wei
            actionId: actionId
        });

        // 初始化仅设置ETH价格预言机
        addToken(address(0), 0x694AA1769357215DE4FAC081bf1f309aDC325306);
        // priceFeeds[address(0)] = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);

        emit ActionCreated(seller, tokenId, tokenAddress, duration, actionId);
    }

    /**
    * @dev 用户发起竞价
    * @param payToken 支付代币地址
    * @param amount 支付金额
    */
    function bidPlace(address payToken, uint256 amount) public payable {
        // 校验拍卖是否开始
        require(block.timestamp >= action.startTime, "The auction hasn't started yet");
        // 判断拍卖是否结束
        require(!action.ended || action.startTime + action.duration < block.timestamp, "The action ended");
        // 禁止卖家出价
        require(msg.sender != action.seller, "The seller is not allowed to bid");

        // 余额
        uint256 balance = 0;
        if (address(0) == payToken) {
            // ETH
            balance = msg.value;
            // 判断余额是否充足
            require(balance >= amount, "Insufficient balance");
        } else {
            // ERC20
            // 校验当前拍卖合约是否有msg.sender的可支配金额
            IERC20 token = IERC20(payToken);
            balance = token.allowance(msg.sender, address(this));
            require(balance >= amount, "ERC20 allowance not enough");
        }

        // 将代币转为USD
        uint256 totalAmount = trasformToken2USD(payToken, amount);
        // 当前最高价(USD)
        uint256 highestPrice = getCurrentHighestPrice();

        // 如果出价低于当前最高价，竞拍失败
        if (totalAmount <= highestPrice) {
            revert BidFailure(highestPrice, payToken);
        }
        
        // 竞拍成功，如果是ERC20代币，将代币转到本合约
        if (payToken != address(0)) {
            bool transferSuccess = IERC20(payToken).transferFrom(msg.sender, address(this), amount);
            require(transferSuccess, "ERC20 transfer failed");
        }

        // 如果存在上一个竞拍人，退还代币
        if (action.highestBidder != address(0)) {
            refund(action.highestBidder, action.payToken, action.highestPrice);
        }
        
        // 更新最高价、出价人、支付代币
        action.highestBidder = msg.sender;
        action.highestPrice = totalAmount;
        action.payToken = payToken;

        // 触发事件
        emit BidPlaced(msg.sender, totalAmount, payToken);
    }

    /**
     * @dev 结束拍卖
     */
    function endAction() public onlySeller {
        // 校验拍卖是否开始
        require(block.timestamp >= action.startTime, "The auction hasn't started yet");
        // 判断拍卖是否结束
        require(!action.ended || action.startTime + action.duration < block.timestamp, "The action ended");

        IERC721 nft = IERC721(action.tokenContract);
        if (action.highestBidder == address(0)) {
            // 没有人出价，退还NFT给卖家
            nft.safeTransferFrom(address(this), action.seller, action.tokenId);
            emit ActionEnd(action.seller, action.tokenId, 0, address(0));
        } else {
            // 将NFT转给买家
            nft.safeTransferFrom(address(this), action.highestBidder, action.tokenId);

            // 将钱转给卖家
            // TODO 收取一定手续费
            refund(action.seller, action.payToken, action.highestPrice);
            emit ActionEnd(action.highestBidder, action.tokenId, action.highestPrice, action.payToken);
        }
    }

    /**
     * @dev 用户退款
     * @param receiver 退款用户地址
     * @param payToken 代币类型
     * @param amount 退款金额
     */
    function refund(address receiver, address payToken, uint256 amount) public nonReentrant {
        // 接收地址不能为0地址
        require(address(0) != receiver, "invalid receiver address");
        // 退款金额必须大于0
        require(amount > 0, "amount must be greater than zero");

        if (address(0) == payToken) {
            // ETH
            payable(receiver).transfer(amount);
        } else {
            // ERC20
            bool success = IERC20(payToken).transfer(receiver, amount);
            if (!success) {
                revert("refund faild");
            }
        }
    }


    /**
     * @dev 将代币转为USD
     * @param payToken 代币地址
     * @param amount 待转换代币金额
     */
    function trasformToken2USD(address payToken, uint256 amount) private view returns(uint256) {
        if (amount == 0) {
            return 0;
        }
        AggregatorV3Interface feed = priceFeeds[payToken];
        // 未设置代币对应的预言机
        require(address(feed) != address(0), "not found priceFeed");

        // 预言机精度
        uint256 decimal = feed.decimals();
        (, int256 rawPrice, , , ) = feed.latestRoundData();
        uint256 price = uint256(rawPrice);

        if (address(0) == payToken) {
            // ETH
            return price * amount / (10**(12 + decimal));
        } else {
            // USDC
            return price * amount / (10**(decimal));
        }
    }

    /**
     * @dev 获取当前最高价格
     */
    function getCurrentHighestPrice() private view returns(uint256) {
        // 如果当前是第一个卖家，以起拍价为最高价格
        uint256 hightestAmount = action.startPrice;
        if (action.highestBidder != address(0)) {
            hightestAmount = action.highestPrice;
        }
        return trasformToken2USD(action.payToken, hightestAmount);
    }

    /**
     * @dev 调整代币价格预言机
     * @notice 开始拍卖前调用此方法进行调整，拍卖进行中不允许调整。
     *        如果管理员错误设置价格预言机，可能会损害用户利益，需要将用户利益与平台利益进行绑定。
     * @param payToken 代币地址
     * @param priceFeed 价格预言机
     */
    function setToken(address payToken, address priceFeed) public onlyOwner {
        // 拍卖已开始不允许设置
        require(action.startTime > block.timestamp, "The auction has begun");
        addToken(payToken, priceFeed);
    }

    function addToken(address payToken, address priceFeed) private {
        require(priceFeed != address(0), "invalid address");
        if (address(priceFeeds[payToken]) == address(0)) {
            // 仅添加一次代币种类，后续修改预言机为替换，无需添加
            supportTokens.push(payToken);
        }
        priceFeeds[payToken] = AggregatorV3Interface(priceFeed);
    }

    /**
     * @dev 返回当前拍卖支持的代币种类
     */
    function getSupportTokens() public view returns(address[] memory) {
        return supportTokens;
    }

    /**
     * @dev 获取拍卖信息
     */
    function getActionInfo() public view returns(ActionInfo memory) {
        return action;
    }

    function onERC721Received(
        address, // operator
        address, // from
        uint256, // tokenId
        bytes calldata // data
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
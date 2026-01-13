// SPDX-License-Identifier: MIT 
pragma solidity >=0.8.20;

import './NFTAuction.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @dev 使用透明代理升级拍卖合约
 */
contract TransparentProxyFactory is Initializable, Ownable {

    // 拍卖逻辑合约地址
    address actionImplementation;

    // 拍卖记录
    // mapping(address token => mapping(uint256 tokenId => bool)) actionMap;

    // 拍卖ID
    uint256 nextActionId;

    event ActionCreated(address indexed seller, uint256 indexed actionId, address actionProxyAddress, uint256 tokenId);

    constructor() Ownable(msg.sender){}

    function initalize(address _actionImplementation) public initializer {
        require(address(0) != _actionImplementation, "invalid implementation address");
        nextActionId = 1;
        actionImplementation = _actionImplementation;
    }

    function createAction(address tokenAddress, uint256 delay, uint256 duration, uint256 startPrice, uint256 tokenId) external {
        // 已经拍卖的代币不能再次拍卖
        // require(actionMap[tokenAddress][tokenId] == 0, "The token has been auctioned");
        require(address(0) != tokenAddress, "invalid token address");
        require(duration > 0, "duration must be greater than zero");
        require(startPrice > 0, "startPrice must be greater than zero");
        require(tokenId > 0, "tokenId must be greater than zero");

        IERC721 nft = IERC721(tokenAddress);
        // 判断当前用户是否拥有NFT
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");
        require(
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Not approved"
        );

        uint256 actionId = nextActionId;
        // 创建代理，传入代理管理员地址和初始化数据
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            actionImplementation,
            address(msg.sender),
            ""
        );
        address actionProxyAddress = address(proxy);
        NFTAuction(payable(actionProxyAddress)).initialize(msg.sender, owner(), tokenAddress, delay, duration, startPrice, tokenId, actionId);
        // actionMap[tokenAddress][tokenId] = actionId;

        // 当前合约将NFT转给拍卖合约
        nft.safeTransferFrom(msg.sender, actionProxyAddress, tokenId);
        nextActionId ++;

        emit ActionCreated(msg.sender, actionId, actionProxyAddress, tokenId);
    }

    function setAuctionImplementation(address newImplementation) public onlyOwner {
        require(address(0) != newImplementation, "invalid implementation");
        actionImplementation = newImplementation;
    }
}
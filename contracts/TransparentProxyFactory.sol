// SPDX-License-Identifier: MIT 
pragma solidity >=0.8.20;

import './NFTAction.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @dev 使用透明代理升级拍卖合约
 */
contract TransparentProxyFactory is Initializable {

    // 拍卖逻辑合约地址
    address actionImplementation;

    // 拍卖记录
    mapping(uint256 actionId => address) actionMap;

    // 拍卖ID
    uint256 nextActionId;

    function initalize(address _actionImplementation) public initializer {
        require(address(0) != _actionImplementation, "invalid implementation address");
        nextActionId = 1;
        actionImplementation = _actionImplementation;
    }

    function createAction(address tokenAddress, uint256 duration, uint256 startPrice, uint256 tokenId) external returns(uint256) {
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
        // 设置onwer为当前工厂合约地址
        // 设置data为空，手动调用initialize方法
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(actionImplementation, address(this), "");
        address actionProxyAddress = address(proxy);
        NFTAction(payable(actionProxyAddress)).initialize(tokenAddress, duration, startPrice, tokenId, actionId);

        // 当前合约将NFT转给拍卖合约
        nft.safeTransferFrom(msg.sender, address(this), tokenId);

        actionMap[actionId] = actionProxyAddress;
        nextActionId ++;
        return actionId;
    }
}
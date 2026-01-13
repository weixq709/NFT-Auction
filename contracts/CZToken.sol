// SPDX-License-Identifier: MIT 
pragma solidity >=0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract CZToken is Ownable, ERC721, ERC721Enumerable {

    uint256 nonce;

    // 每个用户可领取代币数
    mapping(address => uint8) totalCount;

    // 每个用户已领取代币数
    mapping(address => uint8) tokenCount;
    
    constructor() Ownable(msg.sender) ERC721("ChineseZodiacCoin", "CNZOD") {
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return "";
    }

    function requestToken() external {
        uint8 total = totalCount[msg.sender];
        if (total == 0) {
            // 1-5
            total = uint8(getRandomValue(5)) + 1;
            totalCount[msg.sender] = total;
        }
        uint8 count = tokenCount[msg.sender];

        // 判断代币是否发放完
        require(totalSupply() <= 1200, "There are no remaining tokens");
        // 判断当前用户是否领取达到上限
        require(count < total, "The number of tokens has reached the limit");
        // 增加用户领取代币个数
        tokenCount[msg.sender] = count + 1;
        // 铸造代币
        _safeMint(msg.sender, totalSupply() + 1);
    }
    
    // 返回用户可领取代币个数
    function getTokens() public view returns(uint8) {
        uint8 total = totalCount[msg.sender];
        require(total > 0, "please request token");
        return total;
    }

    /**
     * @dev 获取某个用户所有NFT代币ID
     * @param owner 代币持有者地址
     */
    function tokensOfOwner(address owner) public view returns(uint256[] memory){
        uint256 ownerBalance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](ownerBalance);
        
        for (uint256 i = 0; i < ownerBalance; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return tokens;
    }

    function getRandomValue(uint256 max) private returns(uint256) {
        nonce ++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, nonce, blockhash(block.number-1)))) / 1000 % max;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // 重写 _update 函数，指定使用 ERC721Enumerable 的实现
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    // 重写 _increaseBalance 函数，指定使用 ERC721Enumerable 的实现
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
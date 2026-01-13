import { network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { CZToken, ERC20, NFTAuction, TransparentProxyFactory } from '../types/ethers-contracts';
import { BlockTimer } from '../utils';

// also seller
let deployer: HardhatEthersSigner;
let buyer1: HardhatEthersSigner;
let buyer2: HardhatEthersSigner;
let deployerAddress: string;
let buyer1Address = "0x0B1D6528b96EefEaDb787A9aF95b3aD86ac82134";
let buyer2Address = "0xcC036e2D4402bb80f5C31deFFe636851C6e35609";
// usdc代币地址
let usdcTokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
// usdc喂价地址
let usdcOracleAddress = "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E";
// ETCH喂价地址
let etchOracleAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
let usdcContract: ERC20;
let factoryAddress = "";
let auction: NFTAuction | null = null;
let token: CZToken | undefined;

async function main() {
  console.log("开始执行拍卖流程...\n");

  // 连接到网络并获取 ethers
  const { ethers, networkName } = await network.connect();
  
  // 获取网络信息
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = networkInfo.chainId;
  console.log('当前网络: %s, ChainID: %s', networkName, chainId);

  // 根据 chainId 构建部署文件路径
  const deploymentPath = join(process.cwd(), "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");

  try {
    let tx;

    // 读取 Ignition 部署的合约地址
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

    // 获取合约地址
    const tokenAddress = deployment['CZToken#CZToken'];
    const auctionAddress = deployment['NFTAuction#NFTAuction'];
    factoryAddress = deployment['AuctionFactory#TransparentProxyFactory'];

    console.log("\n已部署的合约地址:");
    console.log("CZToken:", tokenAddress);
    console.log("NFTAuction (逻辑合约):", auctionAddress);
    console.log("TransparentProxyFactory:", factoryAddress);

    [deployer, buyer1, buyer2] = await ethers.getSigners();
    deployerAddress = deployer.address;
    console.log('deployer: %s\n', deployerAddress);


    // 连接到合约
    token = await ethers.getContractAt("CZToken", tokenAddress) as unknown as CZToken;
    const factory = await ethers.getContractAt("TransparentProxyFactory", factoryAddress) as unknown as TransparentProxyFactory;

    // 1. 获取NFT代币
    let tokenIds = await token.tokensOfOwner(deployer);

    if (tokenIds.length === 0) {
        try {
            console.log('[%s] 领取代币...\n', deployerAddress);
            // 如果用户没有代币，领取
            tx = await token.requestToken();
            await tx.wait();
        } catch {
            // 领取失败，直接铸造
            console.log("Mint NFT...\n");
            tx = await token.connect(deployer).mint(deployerAddress, 1);
            await tx.wait();
        }

        // 再次查询
        tokenIds = await token.tokensOfOwner(deployer);
    }
    console.log("拥有的 NFT: [%s]\n", tokenIds.join(', '));
    const tokenId = tokenIds[0];

    // 2. 用户授权代币给拍卖工厂
    console.log('[%s] tokenId: %d, 授权NFT...\n', deployerAddress);
    tx = await token.connect(deployer).approve(factoryAddress, tokenId);
    await tx.wait();
    console.log('[%s] 授权完成\n', deployerAddress);

    // 3. 创建拍卖
    // 设置延迟，必须在拍卖开始之前喂价
    const delay = 60;
    const timer = new BlockTimer(ethers.provider, delay);
    timer.start();
    tx = await factory.connect(deployer).createAction(tokenAddress, delay, 10 * 60, 100, tokenId);
    await tx.wait();
    console.log('✓ 创建拍卖成功\n');

    const events = await factory.queryFilter(factory.filters.ActionCreated());

    // 获取最新事件
    const auctionCreateEvent = events[events.length - 1];
    const [ , actionId, auctionProxyAddress] = auctionCreateEvent.args;

    // 连接到拍卖合约
    auction = await ethers.getContractAt("NFTAuction", auctionProxyAddress) as unknown as NFTAuction;

    // 连接到USDC合约
    usdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", usdcTokenAddress) as unknown as ERC20;

    // 设置喂价地址
    console.log('开始喂价...\n');
    // ETH
    tx = await auction.connect(deployer).setToken(ethers.ZeroAddress, etchOracleAddress);
    await tx.wait();

    // USDC
    tx = await auction.connect(deployer).setToken(usdcTokenAddress, usdcOracleAddress);
    await tx.wait();
    console.log('喂价成功 ! \n');


    // 4. 开始竞价
    let finaReceipt;
    // 等待拍卖开始(区块时间，非实际时间)
    const waitTime = timer.getRemaining();
    if(waitTime > 0) {
        console.log('Waiting auction to start (%ds)...\n', waitTime);
        // 等待拍卖开始
        await timer.wait();
    }
    console.log('Auction started !\n');

    // 用户1出价 0.0001ETH
    try {
        console.log('[%s] 开始竞价...\n', buyer1Address);
        const amount1 = ethers.parseEther("0.0001");
        tx = await auction.connect(buyer1).bidPlace(ethers.ZeroAddress, amount1, {value: amount1});
        finaReceipt = await tx.wait();
        console.log('[%s] 出价成功\n', buyer1Address);
    } catch(e) {
        console.error('[%s] 出价失败\n', buyer1Address, e);
    }

    // 用户2出价 100 USDC
    try {
        console.log('[%s] 开始竞价...\n', buyer2Address);
        const amount = ethers.parseUnits("1", 6);
        // 授权 USDC给拍卖合约
        tx = await usdcContract.connect(buyer2).approve(auctionProxyAddress, amount);
        await tx.wait();

        tx = await auction.connect(buyer2).bidPlace(usdcTokenAddress, amount);
        finaReceipt = await tx.wait();
        console.log('[%s] 出价成功\n', buyer2Address);
    } catch(e) {
        console.error('[%s] 出价失败\n', buyer2Address, e);
    }
  } catch (error) {
    console.error("\n执行失败:", error);
    throw error;
  } finally {
    // 一定要结束拍卖
    console.log('等待交易结束...')
    if(auction) {
        // 5. 结束拍卖
        const tx = await auction.connect(deployer).endAction();
        const receipt = await tx.wait();
        console.log("✓ 拍卖已结束\n");

        console.log('Block number: %d', receipt?.blockNumber);
        console.log("Transaction hash: %s", receipt?.hash);

        // 6. 查看拍卖结果
        const actionInfo = await auction.getActionInfo();

        console.log('============ Action Info ============ ');
        console.log('       seller: ', actionInfo.seller);
        console.log('highestBidder: ', actionInfo.highestBidder);
        console.log(' highestPrice: ', actionInfo.highestPrice);
        console.log('     payToken: ', actionInfo.payToken);
        console.log('      tokenId: ', actionInfo.tokenId);
        console.log('============ Action Info ============ ');
    }
  }
}

main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
});
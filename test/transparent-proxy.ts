import { expect, assert } from "chai";
import hre from "hardhat";
import type { CZToken, NFTAuction, TransparentProxyFactory, Coin, MockOracle } from '../types/ethers-contracts';
import type { TypedContractEvent , TypedEventLog } from '../types/ethers-contracts/common'
import type { ActionCreatedEvent as FactoryActionCreatedEvent } from '../types/ethers-contracts/contracts/TransparentProxyFactory.sol/TransparentProxyFactory'
import type { HardhatEthersSigner, HardhatEthers, HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/types";
import type { NetworkHelpers } from '@nomicfoundation/hardhat-network-helpers/types'
import { ContractTransactionResponse, ContractTransactionReceipt, Interface, LogDescription } from "ethers";
import { Timer } from '../utils/index'

const { ethers, provider, networkHelpers } = await hre.network.connect() as unknown as { ethers: HardhatEthers; provider: HardhatEthersProvider, networkHelpers: NetworkHelpers };


describe("Transparent proxy contracts test", function() {

    let deployer: HardhatEthersSigner;
    let seller: HardhatEthersSigner;
    let buyer1: HardhatEthersSigner;
    let buyer2: HardhatEthersSigner;
    // 备用用户
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;

    let nftTokenContract: CZToken;
    let actionContract: NFTAuction;
    let actionFactoryContract: TransparentProxyFactory;
    let usdcTokenContract: Coin;
    let usdcOracleContract: MockOracle;
    let ethOralceContract: MockOracle;

    let tokenAddress: string;
    let actionContractAddress: string
    let actionFactoryAddress: string
    let usdcTokenAddress: string
    let usdcOracleAddress: string;
    let ethOralceAddress: string;
    

    // 仅执行一次
    before(async function() {
        [deployer, seller, buyer1, buyer2, user1, user2] = await ethers.getSigners();
        console.log('deployer: ', deployer)

        // mint ETH
        // networkHelpers.setBalance(seller.address, ethers.parseEther('100'));
        // networkHelpers.setBalance(buyer1.address, ethers.parseEther('100'));
        // networkHelpers.setBalance(buyer2.address, ethers.parseEther('100'));

        // 查询余额
        console.log("seller balance: %d wei", await ethers.provider.getBalance(seller.address));
        console.log("buyer1 balance: %d wei", await ethers.provider.getBalance(buyer1.address));
        console.log("buyer2 balance: %d wei", await ethers.provider.getBalance(buyer2.address));

        // 1. 部署NFT合约
        console.log("Deploying CZToken ...")
        nftTokenContract = await ethers.deployContract("CZToken", [], {signer: deployer});
        await nftTokenContract.waitForDeployment();
        tokenAddress = await nftTokenContract.getAddress();
        console.log("CZToken deployed, address: ", tokenAddress);

        // 2. 部署拍卖合约
        console.log("Deploying NFTAuction ...")
        actionContract = await ethers.deployContract("NFTAuction", [], {signer: deployer});
        await actionContract.waitForDeployment();
        actionContractAddress = await actionContract.getAddress();
        console.log("NFTAuction deployed, address: %s", actionContractAddress);

        // 3. 部署拍卖工厂
        console.log("Deploying TransparentProxyFactory ...")
        actionFactoryContract = await ethers.deployContract("TransparentProxyFactory", [], {signer: deployer});
        await actionFactoryContract.waitForDeployment();
        actionFactoryAddress = await actionFactoryContract.getAddress();
        console.log("TransparentProxyFactory deployed, address: ", actionFactoryAddress);
        // 初始化工厂合约
        actionFactoryContract.initalize(actionContractAddress);

        // 模拟USDC
        const tokenFactory = await ethers.getContractFactory('Coin');
        usdcTokenContract = await tokenFactory.deploy('USD Coin', 'USDC');
        usdcTokenContract.waitForDeployment();
        usdcTokenAddress = await usdcTokenContract.getAddress();

        let tx = await usdcTokenContract.mint(seller.address, 100000000);
        await tx.wait();

        tx = await usdcTokenContract.mint(buyer1.address, 100000000);
        await tx.wait();

        tx = await usdcTokenContract.mint(buyer2.address, 100000000);
        await tx.wait();

        // 查询余额
        console.log("seller balance: %d USDC", await usdcTokenContract.balanceOf(seller.address));
        console.log("buyer1 balance: %d USDC", await usdcTokenContract.balanceOf(buyer1.address));
        console.log("buyer2 balance: %d USDC", await usdcTokenContract.balanceOf(buyer2.address));

        // 预言机
        const oracleFactory = await ethers.getContractFactory('MockOracle');

        // usdc预言机
        usdcOracleContract = await oracleFactory.deploy(ethers.parseUnits("0.999", 6));
        await usdcOracleContract.waitForDeployment();
        usdcOracleAddress = await usdcOracleContract.getAddress();
        
        // ETH预言机
        ethOralceContract = await oracleFactory.deploy(ethers.parseUnits("3000", 8));
        await ethOralceContract.waitForDeployment();
        ethOralceAddress = await ethOralceContract.getAddress();
    })

    // 执行失败不再继续执行
    afterEach(function() {
        if (this.currentTest?.state === 'failed') {
            console.error(this.currentTest.err)
            process.exit(1);
        }
    })

    describe("Test NFT", async function() {

        it("First query token count", async function() {
            const promise = nftTokenContract.connect(seller).getTokens()
            await expect(promise).to.be.rejected;
        })

        it("Request token", async function() {
            await nftTokenContract.connect(seller).requestToken();
            // 然后查询可领取数量
            const count = await nftTokenContract.connect(seller).getTokens();
            console.log('Token amount:', count.toString());
            const balance = await nftTokenContract.balanceOf(seller);
            console.log('NFT balance: ', balance);

            // 断言返回值在 1-5 之间
            expect(count).to.be.greaterThan(0);
            expect(count).to.be.lessThanOrEqual(5);
        })

        it("Token limit", async function() {
            const connectedContract = nftTokenContract.connect(seller);
            const tokenCount = await connectedContract.getTokens();
            const count = Number(tokenCount);
            console.log('Token amount:', count);

            // 领取剩余代币
            for (let i = 0; i < count - 1; i ++) {
                await connectedContract.requestToken();
            }

            // 查询余额
            const balance = await nftTokenContract.balanceOf(seller);
            console.log('NFT balance: ', balance);

            // 再次请求，报错
            const res = connectedContract.requestToken();
            await expect(res).to.be.rejected;
        })
    })

    // 拍卖代理合约对象
    let auctionProxyContract: NFTAuction;
    // 默认拍卖延迟时间 30s
    const defaultAuctionDelay = 10;
    // 计时器
    const auctoinTimer = new Timer(defaultAuctionDelay);
    // 无买家拍卖工厂创建事件
    let noBuyerAuctionEvent: LogDescription;

    describe("Create Single Auction", function() {

        let tokenId: bigint
        // 持续时间 30分钟
        const duration = 30 * 60;
        // 起拍价 1000wei
        const startPrice = 1000;
    
        let factoryCreateEvent: TypedEventLog<TypedContractEvent<FactoryActionCreatedEvent.InputTuple, FactoryActionCreatedEvent.OutputTuple, FactoryActionCreatedEvent.OutputObject>>

        it("Seller create auction", async function() {
            // 获取seller用户所有代币
            const tokenIds = await nftTokenContract.tokensOfOwner(seller);
            console.log('token ids: ', tokenIds);
            // 选择第一个代币进行出售
            tokenId = tokenIds[0];

            // 将代币授权给合约工厂
            let tx = await nftTokenContract.connect(seller).approve(actionFactoryAddress, tokenId);
            await tx.wait();

            const approvedAddress = await nftTokenContract.getApproved(tokenId);
            console.log('target: %s, approve: %s', actionFactoryAddress, approvedAddress);

            // 创建拍卖信息
            auctoinTimer.start();
            const createActionTx = await actionFactoryContract.connect(seller).createAction(tokenAddress, defaultAuctionDelay, duration, startPrice, tokenId);
            await createActionTx.wait();

            const events = await actionFactoryContract.queryFilter(actionFactoryContract.filters.ActionCreated());
            expect(events.length).to.be.greaterThan(0);
            factoryCreateEvent = events[0];
            expect(factoryCreateEvent.eventName).to.be.equals('ActionCreated');

            // 获取拍卖代理合约对象
            const [, auctionId, auctionProxyAddress] = factoryCreateEvent.args;
            console.log('actionId: %s, addr: ', auctionId, auctionProxyAddress);
            auctionProxyContract = await ethers.getContractAt("NFTAuction", auctionProxyAddress);

            // 检查seller是否匹配
            const proxyEvents = await auctionProxyContract.queryFilter(auctionProxyContract.filters.ActionCreated);
            expect(proxyEvents.length).to.be.greaterThan(0);
            const [auctionSeller] = proxyEvents[0].args;
            expect(auctionSeller).to.be.equals(seller);
        })

        it("User1 early bidding", async function() {
            expect(auctoinTimer.isComplete(), "The auction has begun and bidding is not allowed").to.false;
            // 出价ETH(2000wei)
            const res = auctionProxyContract.connect(buyer1).bidPlace('0x0', 2000n);
            // 拍卖未开始，出价失败
            await expect(res).to.be.rejected;
        })

        it("Auction the same token again", async function() {
            // 再次尝试拍卖
            const tx = actionFactoryContract.connect(seller).createAction(tokenAddress, 0, duration, startPrice, tokenId);
            // 期望拍卖失败
            await expect(tx).to.be.rejected;
        })

        it("Get auction info", async function() {
            const [, actionId, actionProxyAddress] = factoryCreateEvent.args;

            console.log('actionId: %s, addr: ', actionId, actionProxyAddress);
            const action = await ethers.getContractAt("NFTAuction", actionProxyAddress);
            const actionInfo = await action.getActionInfo();

            console.log('============ Action Info ============ ');
            console.log('       seller: ', actionInfo.seller);
            console.log('highestBidder: ', actionInfo.highestBidder);
            console.log(' highestPrice: ', actionInfo.highestPrice);
            console.log('     payToken: ', actionInfo.payToken);
            console.log('      tokenId: ', actionInfo.tokenId);
            console.log('============ Action Info ============ ');
            
            expect(actionInfo.actionId).to.be.equals(actionId);
        })
        
        it("Trigger the auction contract creation event", async function() {
            const [, , actionProxyAddress] = factoryCreateEvent.args;
            const proxyAuctionContract = await ethers.getContractAt("NFTAuction", actionProxyAddress);
            const events = await proxyAuctionContract.queryFilter(proxyAuctionContract.filters.ActionCreated());
            expect(events.length).to.be.greaterThan(0);
            expect(events[0].eventName).to.be.equals('ActionCreated');
        })

        it("Create multi auction", async function() {
            // 保证至少有两枚代币，每个用户均领取一次
            // 用户1领取
            const tx1 = await nftTokenContract.connect(buyer1).requestToken();
            await tx1.wait();
            const user1TokenIds = await nftTokenContract.tokensOfOwner(buyer1);
            const tokenId1 = user1TokenIds[0];

            // 用户2领取
            const tx2 = await nftTokenContract.connect(buyer2).requestToken();
            await tx2.wait();
            const user2TokenIds = await nftTokenContract.tokensOfOwner(buyer2);
            const tokenId2 = user2TokenIds[0];

            // 创建多个拍卖
            // 用户1授权代币给工厂合约
            let tx = await nftTokenContract.connect(buyer1).approve(actionFactoryAddress, tokenId1);
            await tx.wait();

            // 用户1拍卖
            const actionRes1 = await actionFactoryContract.connect(buyer1).createAction(tokenAddress, 0, duration, startPrice, tokenId1);
            const receipt1 = await actionRes1.wait();

            // 用户2授权代币给工厂合约
            tx = await nftTokenContract.connect(buyer2).approve(actionFactoryAddress, tokenId2);
            await tx.wait();
            // 用户2拍卖
            const actionRes2 = await actionFactoryContract.connect(buyer2).createAction(tokenAddress, 0, duration, startPrice, tokenId2);
            const receipt2 = await actionRes2.wait();

            // 判断创建拍卖是否成功
            const event1 = getEventFromLogs(actionFactoryContract.interface, receipt1, "ActionCreated");
            const event2 = getEventFromLogs(actionFactoryContract.interface, receipt2, "ActionCreated");
            expect(event1).to.not.null;
            expect(event2).to.not.null;
            noBuyerAuctionEvent = event1!;

            // 对比卖家信息
            expect(event1?.args[0]).to.be.equals(buyer1.address);
            expect(event2?.args[0]).to.be.equals(buyer2.address);
            // 对比tokenId
            expect(event1?.args[3]).to.be.equals(tokenId1);
            expect(event2?.args[3]).to.be.equals(tokenId2);
        })
    })

    describe("Test set token", function() {

        it("Admin set token", async function() {
            await expect(auctionProxyContract.connect(deployer).setToken(ethers.ZeroAddress, ethOralceAddress)).to.be.fulfilled;
        })

        it("Non admin set token", async function() {
            await expect(auctionProxyContract.connect(buyer1).setToken(ethers.ZeroAddress, ethOralceAddress)).to.be.rejected;
        })

        it("Set invalid token", async function() {
            await expect(auctionProxyContract.connect(buyer1).setToken(ethers.ZeroAddress, ethers.ZeroAddress)).to.be.rejected;
        })
    })

    // 拍卖开始后且拍卖结束前
    describe("Place bid", function() {

        it("Invalid bid", async function() {
            // 买家出价
            await expect(auctionProxyContract.bidPlace(ethers.ZeroAddress, 888)).to.be.rejected;
        })

        it("Set ETH dataFeed", async function() {
            // 拍卖合约初始化ETH喂价为sepolia测试环境地址，修改为自定义喂价地址
            await expect(auctionProxyContract.connect(deployer).setToken(ethers.ZeroAddress, ethOralceAddress)).to.be.fulfilled;
        })

        it("Add USDC dataFedd", async function() {
            await expect(auctionProxyContract.connect(deployer).setToken(usdcTokenAddress, usdcOracleAddress)).to.be.fulfilled;
        })

        // 使用ETC出价
        it("[User1] Use ETH to bid", async function() {
            console.log(`Waiting auction to start...`);
            await auctoinTimer.wait();
            console.log('The auction has begun');
            const amount = ethers.parseEther("0.001");
            await expect(auctionProxyContract.connect(buyer1).bidPlace(ethers.ZeroAddress, amount, { value: amount })).to.be.fulfilled;
            const transferedAmount = await ethers.provider.getBalance(await auctionProxyContract.getAddress());
            console.log('action eth balance: ', transferedAmount);
            expect(transferedAmount).to.be.equals(amount);
            console.log('User 1 successful bid, address: ', buyer1.address);
        })

        // 使用usdc出价
        it("[User2] Use USDC to bid ", async function() {
            const amount = ethers.parseUnits("1", 6);
            // 授权代币，以拍卖成功后转账
            let tx = await usdcTokenContract.connect(buyer2).approve(await auctionProxyContract.getAddress(), amount);
            await tx.wait();

            // 成功说明用户2出价比用户1高
            await expect(auctionProxyContract.connect(buyer2).bidPlace(usdcTokenAddress, amount)).to.be.fulfilled;
            console.log('User 2 successful bid, address: ', buyer2.address);
        })

        it("Get support tokens", async function() {
            const tokens = await auctionProxyContract.getSupportTokens();
            console.log('support tokens\n%s\n', tokens.join("\n"));
            expect(tokens.length).to.be.greaterThan(0);
        })
    })

    describe("Aauction Result", function() {

        let auctionReceipt: ContractTransactionReceipt | null
        it("End auction", async function() {
            let tx = auctionProxyContract.connect(seller).endAction();
            const res = await expect(tx).to.be.fulfilled;
            auctionReceipt = await res.wait();
            console.log('tx hash: ', auctionReceipt?.hash)
        });

        it("Show auciton result", async function() {
            const actionEndEvent = getEventFromLogs(actionContract.interface, auctionReceipt, "ActionEnd");
            expect(actionEndEvent).not.null;
            const [highestBidder, tokenId, highestPrice, payToken] = actionEndEvent!.args;
            
            expect(highestBidder).not.be.equals(ethers.ZeroAddress);
            console.log('============ Action Result ============ ');
            console.log('highestBidder: ', highestBidder);
            console.log(' highestPrice: ', highestPrice);
            console.log('     payToken: ', payToken);
            console.log('      tokenId: ', tokenId);
            console.log('============ Action Result ============ ');
        })

        // it("Whether the user1 refunded", async function() {
        // })

        it("Set token after auction ended", async function() {
            await expect(auctionProxyContract.connect(deployer).setToken(ethers.ZeroAddress, ethOralceAddress)).to.be.rejected;
        })

        it("Token returned if no buyer", async function() {
            const [ , , proxyAuctionAddress, tokenId] = noBuyerAuctionEvent.args;
            const action = await ethers.getContractAt("NFTAuction", proxyAuctionAddress);
            // 结束拍卖
            let tx = await action.connect(buyer1).endAction();
            await tx.wait();

            // 验证NFT持有人是否为卖家
            const owner = await nftTokenContract.ownerOf(tokenId);
            expect(owner).to.be.equals(buyer1.address);
        })
    })

    describe("Upgrade implementaion", function() {
        
        it("Upgrade", async function() {
            // 创建一个新的实现
            const newTokenContract = await ethers.deployContract("NFTAuctionV2");
            await newTokenContract.waitForDeployment();
            const newImplAddress = await newTokenContract.getAddress();
            console.log('CZToken new version deployed, address: ', newImplAddress);

            // 升级合约
            await actionFactoryContract.connect(deployer).setAuctionImplementation(newImplAddress);

            // 获取seller的代币
            let tokenIds = await nftTokenContract.tokensOfOwner(seller.address);
            let tx;
            if(tokenIds.length === 0) {
                // 再次领取
                tx = await nftTokenContract.connect(seller).requestToken();
                tx = await tx.wait();
                tokenIds = await nftTokenContract.tokensOfOwner(seller.address);
            }
            expect(tokenIds.length).to.be.greaterThan(0);
            const tokenId = tokenIds[0];
            console.log('tokenId ', tokenId);

            // 授权
            tx = await nftTokenContract.connect(seller).approve(actionFactoryAddress, tokenId);
            await tx.wait();

            // 创建新的拍卖
            tx = await actionFactoryContract.connect(seller).createAction(tokenAddress, 0, 10, 100, tokenId);
            const receipt = await tx.wait();
            const event = getEventFromLogs(actionFactoryContract.interface, receipt, "ActionCreated");
            expect(event).not.null;

            const [ , , auctionProxyAddress] = event!.args;
            const auction = await ethers.getContractAt('NFTAuctionV2', auctionProxyAddress);
            expect(await auction.test()).to.be.equals("hello");
        })
    })
})

function getEventFromLogs(contractInterface: Interface, receipt: ContractTransactionReceipt | null, eventName: string) : LogDescription | null {
    if (receipt == null) {
        return null;
    }

    const targetEvent = receipt.logs.find((log) => {
        try {
            const parsed = contractInterface.parseLog({
                topics: log.topics as string[],
                data: log.data
            });
            return parsed?.name === eventName;
        } catch {
            return false;
        }
    });

    if(!targetEvent) {
        return null;
    }

    const parsedEvent = contractInterface.parseLog({
        topics: targetEvent!.topics as string[],
        data: targetEvent!.data
    });
    return parsedEvent;
}
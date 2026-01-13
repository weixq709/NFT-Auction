import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import CZToken from "./CZToken";
import NFTAuction from "./NFTAuction";
import AuctionFactory from "./AuctionFactory";

// 将需要部署的模块单独一个文件是为了遵循官方推荐的方式
// 此模块是为了统一部署所有需要部署所有需要部署的合约
export default buildModule("Main", (m) => {
    // 部署CZToken
    const { token } = m.useModule(CZToken);

    // 部署Auction逻辑合约
    const { auction } = m.useModule(NFTAuction);

    // 部署工厂合约
    const { auctionFactory } = m.useModule(AuctionFactory);
    return { token, auction, auctionFactory };
})
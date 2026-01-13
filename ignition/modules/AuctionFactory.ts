import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import NFTAuction from "./NFTAuction";

export default buildModule("AuctionFactory", (m) => {
    const { auction } = m.useModule(NFTAuction);
    const auctionFactory = m.contract('TransparentProxyFactory', [], {
        after: [auction]
    });

    m.call(auctionFactory, "initalize", [auction]);
    return { auctionFactory };
})
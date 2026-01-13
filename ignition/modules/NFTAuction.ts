import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTAuction", (m) => {
    const auction = m.contract('NFTAuction');
    return { auction };
})
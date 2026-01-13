import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CZToken", (m) => {
    const token = m.contract('CZToken');
    return { token };
})
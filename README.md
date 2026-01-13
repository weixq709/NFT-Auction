## 项目结构

```
token/
├── contracts/              # Solidity 智能合约
│   ├── CZToken.sol         # NFT 代币合约（ERC721）
│   ├── NFTAuction.sol      # NFT 拍卖逻辑合约
│   ├── TransparentProxyFactory.sol  # 透明代理工厂合约
│   ├── MockOracle.sol      # 模拟预言机合约
├── ignition/               # Hardhat Ignition 部署模块
│   ├── modules/            # 部署模块定义
│   │   ├── CZToken.ts      # CZToken 部署模块
│   │   ├── NFTAuction.ts   # NFTAuction 部署模块
│   │   ├── AuctionFactory.ts  # 拍卖工厂部署模块
│   │   └── main.ts         # 主部署模块（部署所有合约）
│   └── deployments/        # 部署记录（自动生成）
│       └── chain-{chainId}/  # 按链 ID 分类的部署数据
├── scripts/                # 脚本文件
│   └── auction.ts          # 拍卖流程执行脚本
├── test/                   # 测试文件
│   └── transparent-proxy.ts  # 透明代理测试
├── hardhat.config.ts       # Hardhat 配置文件
├── package.json            # 项目依赖和脚本
├── tsconfig.json           # TypeScript 配置
└── .gitignore              # Git 忽略文件配置
```

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

使用 Hardhat keystore 安全地存储敏感信息：

```bash
# 设置 Sepolia RPC URL
npx hardhat keystore set SEPOLIA_RPC_URL

# 设置私钥（卖家/部署人）
npx hardhat keystore set SEPOLIA_PRIVATE_KEY

# 设置买家1
npx hardhat keystore set SEPOLIA_BUYER1

# 设置买家2
npx hardhat keystore set SEPOLIA_BUYER2
```

### 3. 脚本说明

| 脚本命令 | 说明 |
|---------|------|
| `npm run compile` | 编译所有 Solidity 合约 |
| `npm run build` | 构建项目（包括编译和类型生成） |
| `npm run test` | 运行测试套件 |
| `npm run test:coverage` | 运行测试并生成代码覆盖率报告 |
| `npm run create` | 执行拍卖流程脚本 |
| `npm run deploy:local` | 启动本地 Hardhat 节点并部署合约到 localhost |
| `npm run deploy:sepolia` | 部署合约到 Sepolia 测试网（智能部署，只部署未部署的合约） |
| `npm run redeploy:sepolia` | 强制重新部署所有合约到 Sepolia 测试网（使用 --reset 参数） |

###  4. 创建拍卖

```bash
npm run create
```



![transaction](D:\workspace\contract\token\img\transaction.png)

## 测试报告

![coverage](D:\workspace\contract\token\img\coverage.png)

## 问题总结

### 事件检测方式

在 Hardhat 3 中，检测合约事件有两种常用方式：

1. 从交易收据中解析事件

```typescript
const tx = ...
const receipt = await tx.wait();

const actionCreatedEvent = receipt?.logs.find((log) => {
  try {
    const parsed = factoryContract.interface.parseLog({
      topics: log.topics as string[],
      data: log.data
    });
    return parsed?.name === "ActionCreated";
  } catch {
    return false;
  }
});

if (actionCreatedEvent) {
  const parsedEvent = factoryContract.interface.parseLog({
    topics: actionCreatedEvent.topics as string[],
    data: actionCreatedEvent.data
  });
  console.log("Event args:", parsedEvent?.args);
}
```

**适用场景**：
- 需要立即获取刚刚发送的交易的事件
- 交易确认后立即处理事件

2. 使用 queryFilter 查询历史事件

```typescript
const actionCreatedEvents = await factoryContract.queryFilter(
  factoryContract.filters.ActionCreated()
);

if (actionCreatedEvents.length > 0) {
  const [actionId, actionProxyAddress] = actionCreatedEvents[0].args;
  console.log(`Action ID: ${actionId}, Address: ${actionProxyAddress}`);

  const action = await ethers.getContractAt("NFTAction", actionProxyAddress);
  const actionInfo = await action.getActionInfo();
  console.log(actionInfo);
}
```

**适用场景**：

- 查询历史事件
- 批量获取事件
- 不需要立即处理，可以异步查询

## TODO

- [ ] 实现平台收费功能
- [ ] 使用 UUPS 代理模式替代透明代理
- [ ] 使用 ERC1967 代理标准
- [ ] 添加更多测试用例
- [ ] 优化 gas 消耗
- [ ] 添加前端界面

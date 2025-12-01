# Web3 University - 去中心化课程平台

基于区块链的去中心化在线教育平台，使用 Sepolia 测试网。

## 功能特性

- 💰 **YD 代币经济**：使用 YD 代币进行课程交易
- 📚 **课程管理**：创建、购买、查看课程
- 🎓 **去中心化存储**：课程内容存储在 IPFS
- 💎 **质押挖矿**：质押 ETH 获得 YD 代币奖励
- 🚰 **代币水龙头**：领取测试用 YD 代币

## 技术栈

- **前端框架**：Next.js 14 + React 18
- **Web3 库**：Wagmi v3 + Viem v2
- **样式**：Tailwind CSS
- **区块链**：Sepolia 测试网
- **存储**：Pinata IPFS

## 开始使用

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，并填入你的 Pinata API 密钥：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
# 使用 JWT（推荐）
NEXT_PUBLIC_PINATA_JWT=你的_pinata_jwt

# 或者使用 API Key + Secret
# NEXT_PUBLIC_PINATA_API_KEY=你的_api_key
# NEXT_PUBLIC_PINATA_SECRET_KEY=你的_secret_key

# IPFS Gateway
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud
```

### 3. 配置合约地址

编辑 `api/frontend-config.json`，填入你部署的合约地址和 ABI。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 智能合约

本项目需要以下合约部署在 Sepolia 测试网：

- **YDToken**: ERC-20 代币合约
- **CourseManager**: 课程管理合约
- **CoursePurchase**: 课程购买合约
- **YDFaucet**: 代币水龙头合约
- **YDStakingSafe**: 质押挖矿合约

## MetaMask 配置

1. 安装 [MetaMask](https://metamask.io/)
2. 切换到 **Sepolia 测试网**
3. 从水龙头获取测试 ETH：[Sepolia Faucet](https://sepoliafaucet.com/)

## 项目结构

```
web3-university-frontend/
├── pages/              # Next.js 页面
│   ├── index.js       # 首页
│   ├── faucet.js      # 水龙头页面
│   └── staking.js     # 质押页面
├── components/         # React 组件
│   ├── CreateCourseModal.js
│   ├── PurchaseCourseModal.js
│   ├── CourseList.js
│   ├── CourseContentViewer.js
│   └── PinataUpload.js
├── lib/
│   └── wagmi.js       # Wagmi 配置
├── api/
│   └── frontend-config.json  # 合约配置
└── config.js          # 全局配置
```

## 部署

本项目支持多种部署方式，推荐使用 **Cloudflare Pages**（免费 + 全球 CDN）。

### Cloudflare Pages 部署（推荐）

详细步骤请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

快速部署：

```bash
# 1. 安装 Wrangler CLI
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 部署
npm run deploy:cloudflare
```

### Vercel 部署

1. 推送代码到 GitHub
2. 在 [Vercel](https://vercel.com) 导入仓库
3. 配置环境变量（Pinata API 密钥）
4. 部署

## 许可证

MIT

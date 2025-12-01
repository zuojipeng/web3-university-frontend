# 部署到 Cloudflare Pages

本项目支持部署到 Cloudflare Pages，以下是完整的部署流程。

## 📋 准备工作

### 1. 安装 Wrangler CLI（Cloudflare 的命令行工具）

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare 账号

```bash
wrangler login
```

这会打开浏览器，让你授权 Wrangler 访问你的 Cloudflare 账号。

## 🚀 部署方式

### 方式 1：使用 Wrangler CLI 部署（推荐）

#### 首次部署

```bash
# 1. 构建项目
npm run build

# 2. 部署到 Cloudflare Pages
npx wrangler pages deploy out --project-name=web3-university
```

或者使用快捷脚本：

```bash
npm run deploy:cloudflare
```

#### 后续更新

每次更新代码后，重新运行：

```bash
npm run deploy:cloudflare
```

### 方式 2：通过 Cloudflare Dashboard 部署（适合 CI/CD）

1. **推送代码到 GitHub**
   ```bash
   git push origin main
   ```

2. **在 Cloudflare Dashboard 创建 Pages 项目**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 **Pages** → **Create a project**
   - 选择 **Connect to Git**
   - 授权并选择你的 GitHub 仓库
   
3. **配置构建设置**
   - **Framework preset**: Next.js (Static HTML Export)
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
   - **Root directory**: `/`
   
4. **配置环境变量**
   
   在 **Settings** → **Environment variables** 添加：
   
   ```
   NEXT_PUBLIC_PINATA_JWT=你的_pinata_jwt
   NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud
   ```
   
   ⚠️ **重要**：不要在 GitHub 上提交真实的 API 密钥！

5. **部署**
   
   点击 **Save and Deploy**，Cloudflare 会自动构建并部署你的项目。

## 🔧 配置环境变量

### 通过 Wrangler CLI 配置

```bash
# 设置环境变量
wrangler pages secret put NEXT_PUBLIC_PINATA_JWT
# 输入密钥后按 Enter

wrangler pages secret put NEXT_PUBLIC_IPFS_GATEWAY
# 输入: https://gateway.pinata.cloud
```

### 通过 Cloudflare Dashboard 配置

1. 进入你的 Pages 项目
2. **Settings** → **Environment variables**
3. 点击 **Add variable**
4. 添加以下变量：
   - `NEXT_PUBLIC_PINATA_JWT`
   - `NEXT_PUBLIC_IPFS_GATEWAY`

## 📝 部署后检查

1. **访问部署的网站**
   
   Cloudflare 会提供一个 URL，例如：
   ```
   https://web3-university.pages.dev
   ```

2. **测试功能**
   - ✅ 连接 MetaMask
   - ✅ 切换到 Sepolia 网络
   - ✅ 创建课程（上传到 IPFS）
   - ✅ 购买课程
   - ✅ 查看课程内容

3. **绑定自定义域名（可选）**
   
   在 **Custom domains** 添加你自己的域名：
   - 点击 **Set up a custom domain**
   - 输入域名（例如 `web3-university.example.com`）
   - 按照提示配置 DNS 记录

## 🔍 常见问题

### Q: 部署后页面空白或报错？

**A**: 检查以下几点：
1. 确保 `next.config.js` 包含 `output: 'export'`
2. 确保环境变量已正确配置
3. 查看浏览器控制台的错误信息

### Q: IPFS 上传失败？

**A**: 检查：
1. `NEXT_PUBLIC_PINATA_JWT` 是否正确设置
2. Pinata API 密钥是否有效
3. 浏览器控制台的错误日志

### Q: MetaMask 连接失败？

**A**: 
1. 确保 MetaMask 已安装
2. 切换到 Sepolia 测试网
3. 检查网络连接

### Q: 合约调用失败？

**A**: 
1. 确保 `api/frontend-config.json` 中的合约地址正确
2. 确保合约已部署在 Sepolia 测试网
3. 检查钱包是否有足够的测试 ETH 和 YD 代币

## 🔄 自动部署（CI/CD）

Cloudflare Pages 支持自动部署：

1. 连接 GitHub 仓库后，每次推送到 `main` 分支都会自动触发部署
2. Pull Request 会创建预览部署
3. 可以在 **Deployments** 页面查看部署历史和日志

## 📊 性能优化建议

- ✅ 已启用静态导出（`output: 'export'`）
- ✅ 已禁用 Next.js Image Optimization（Cloudflare Pages 不支持）
- ✅ 使用 Cloudflare CDN 加速全球访问
- ⚠️ IPFS 内容加载速度取决于 Pinata Gateway

## 🛡️ 安全提示

1. **不要在代码中硬编码 API 密钥**
   - ✅ 使用环境变量
   - ✅ `.env` 文件已被 `.gitignore` 忽略

2. **保护 Pinata API 密钥**
   - ✅ 只在 Cloudflare Dashboard 配置
   - ✅ 不要在 GitHub 上提交

3. **合约地址可以公开**
   - ✅ 测试网合约地址是公开的
   - ✅ 任何人都可以在 Sepolia Etherscan 查看

## 📞 需要帮助？

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Next.js 静态导出文档](https://nextjs.org/docs/pages/building-your-application/deploying/static-exports)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)

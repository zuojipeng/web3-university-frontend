# 前端开发需求文档

## 📋 新增合约功能需求

本文档描述了针对新增的 `YDFaucet`（水龙头）和 `YDStakingSafe`（质押）合约的前端开发需求。

---

## 🚰 YDFaucet - 水龙头合约

### 功能概述
允许用户免费领取 YD 代币，用于测试和学习。每次领取有冷却时间限制。

### 前端需要实现的功能

#### 1. **领取代币页面**
- **功能**: 用户点击按钮领取 YD 代币
- **调用合约**: `claim()`
- **UI 元素**:
  - 显示当前可领取数量（从合约读取 `faucetAmount()`）
  - 显示冷却时间（从合约读取 `cooldownTime()`）
  - "领取" 按钮（调用 `claim()`）
  - 显示用户上次领取时间（从合约读取 `lastClaim(userAddress)`）

#### 2. **状态检查**
- **功能**: 检查用户是否可以领取
- **调用合约**: `canClaim(userAddress)` → 返回 `bool`
- **UI 显示**:
  - 如果可以领取：显示 "可以领取" 状态，按钮可用
  - 如果冷却中：显示倒计时，按钮禁用

#### 3. **倒计时显示**
- **功能**: 显示距离下次可领取的剩余时间
- **调用合约**: `nextClaimTime(userAddress)` → 返回剩余秒数
- **UI 显示**:
  - 实时倒计时（天/小时/分钟/秒）
  - 如果返回 0，表示可以立即领取

#### 4. **水龙头余额显示**
- **功能**: 显示水龙头合约中的 YD 余额
- **调用合约**: `getFaucetBalance()` → 返回 `uint256`
- **UI 显示**:
  - 显示当前余额
  - 如果余额不足，提示 "水龙头已空"

#### 5. **统计信息**
- **功能**: 显示水龙头使用统计
- **调用合约**: 
  - `totalClaimed()` → 总领取数量
  - `totalUsers()` → 总用户数
- **UI 显示**: 统计卡片展示

### 前端交互流程

```
用户进入水龙头页面
    ↓
检查 canClaim(userAddress)
    ↓
如果 false → 显示倒计时，按钮禁用
如果 true → 显示"可以领取"，按钮可用
    ↓
用户点击"领取"按钮
    ↓
调用 claim() 函数
    ↓
等待交易确认
    ↓
更新 UI（显示成功提示，更新余额）
```

### 需要读取的合约数据

| 函数名 | 参数 | 返回值 | 用途 |
|--------|------|--------|------|
| `faucetAmount()` | 无 | `uint256` | 每次领取数量 |
| `cooldownTime()` | 无 | `uint256` | 冷却时间（秒） |
| `canClaim(address)` | 用户地址 | `bool` | 是否可以领取 |
| `nextClaimTime(address)` | 用户地址 | `uint256` | 剩余时间（秒） |
| `lastClaim(address)` | 用户地址 | `uint256` | 上次领取时间 |
| `getFaucetBalance()` | 无 | `uint256` | 水龙头余额 |
| `totalClaimed()` | 无 | `uint256` | 总领取数量 |
| `totalUsers()` | 无 | `uint256` | 总用户数 |

### 需要调用的合约函数

| 函数名 | 参数 | Gas 估算 | 说明 |
|--------|------|----------|------|
| `claim()` | 无 | ~50,000 | 领取代币（需要等待冷却时间） |

---

## 💎 YDStakingSafe - 质押合约

### 功能概述
用户质押 ETH，获得 YD 代币奖励。支持多个质押档位，不同档位有不同的锁定期和 APY。

### 前端需要实现的功能

#### 1. **质押页面**
- **功能**: 用户选择档位并质押 ETH
- **调用合约**: `stake(uint256 tier)` payable
- **UI 元素**:
  - 显示所有可用档位（调用 `getAllTiers()`）
  - 每个档位显示：
    - 最小金额（ETH）
    - YD 奖励数量
    - 锁定期（天）
    - APY（年化收益率）
    - 状态（激活/未激活）
  - 输入框：用户输入质押金额（ETH）
  - "质押" 按钮（调用 `stake(tier)`，发送 ETH）

#### 2. **我的质押页面**
- **功能**: 显示用户的所有质押记录
- **调用合约**: `getUserStakes(userAddress)` → 返回 `Stake[]`
- **UI 显示**:
  - 列表展示所有质押记录
  - 每条记录显示：
    - 质押 ID
    - 质押金额（ETH）
    - YD 奖励数量
    - 档位
    - 开始时间
    - 结束时间（解锁时间）
    - 已领取奖励
    - 状态（活跃/已赎回）
    - 预计总奖励

#### 3. **活跃质押列表**
- **功能**: 只显示用户当前活跃的质押
- **调用合约**: `getActiveStakes(userAddress)` → 返回 `Stake[]`
- **UI 显示**: 同"我的质押"，但只显示 `isActive = true` 的记录

#### 4. **领取奖励功能**
- **功能**: 用户领取质押奖励（不解除质押）
- **调用合约**: `claimReward(uint256 stakeId)`
- **UI 元素**:
  - 在每条质押记录旁边显示"领取奖励"按钮
  - 显示可领取奖励数量（`calculateReward(stakeId) - claimedReward`）

#### 5. **赎回功能**
- **功能**: 用户赎回质押的 ETH
- **调用合约**: 
  - `unstake(uint256 stakeId)` - 正常赎回（锁定期结束后）
  - `unstakeEarly(uint256 stakeId)` - 提前赎回（扣 20% 罚金）
- **UI 元素**:
  - 如果锁定期已结束：显示"正常赎回"按钮
  - 如果锁定期未结束：显示"提前赎回"按钮（带警告提示，说明会扣 20% 罚金）

#### 6. **奖励计算器**
- **功能**: 帮助用户计算预期收益
- **调用合约**: `calculateReward(uint256 stakeId)` → 返回 `uint256`
- **UI 显示**:
  - 输入框：质押金额、选择档位
  - 实时计算：预计 YD 奖励、预计 ETH 奖励（基于 APY）

#### 7. **合约资金状态**
- **功能**: 显示合约的资金状态（管理员视图）
- **调用合约**: `getContractBalance()` → 返回多个值
- **UI 显示**:
  - 合约总余额（ETH）
  - 用户质押总额
  - 平台收益
  - 可用余额

#### 8. **质押档位详情**
- **功能**: 显示所有质押档位的详细信息
- **调用合约**: `getAllTiers()` → 返回 `StakingTier[]`
- **UI 显示**: 卡片或表格展示所有档位信息

### 前端交互流程

#### 质押流程
```
用户进入质押页面
    ↓
调用 getAllTiers() 获取所有档位
    ↓
用户选择档位，输入质押金额
    ↓
验证：金额 >= 档位最小金额
    ↓
调用 stake(tier) 函数，发送 ETH
    ↓
等待交易确认
    ↓
显示成功提示，更新质押列表
```

#### 领取奖励流程
```
用户查看"我的质押"页面
    ↓
调用 getUserStakes(userAddress)
    ↓
对每条活跃质押，调用 calculateReward(stakeId)
    ↓
显示可领取奖励数量
    ↓
用户点击"领取奖励"按钮
    ↓
调用 claimReward(stakeId)
    ↓
等待交易确认
    ↓
更新 UI（显示已领取金额）
```

#### 赎回流程
```
用户查看"我的质押"页面
    ↓
检查每条质押的 endTime
    ↓
如果 block.timestamp >= endTime:
    → 显示"正常赎回"按钮
如果 block.timestamp < endTime:
    → 显示"提前赎回"按钮（带警告）
    ↓
用户点击赎回按钮
    ↓
调用 unstake(stakeId) 或 unstakeEarly(stakeId)
    ↓
等待交易确认
    ↓
更新 UI（标记为已赎回）
```

### 需要读取的合约数据

| 函数名 | 参数 | 返回值 | 用途 |
|--------|------|--------|------|
| `getAllTiers()` | 无 | `StakingTier[]` | 获取所有质押档位 |
| `getUserStakes(address)` | 用户地址 | `Stake[]` | 获取用户所有质押 |
| `getActiveStakes(address)` | 用户地址 | `Stake[]` | 获取用户活跃质押 |
| `calculateReward(uint256)` | 质押 ID | `uint256` | 计算奖励数量 |
| `getContractBalance()` | 无 | 多个值 | 获取合约资金状态 |
| `totalStakes()` | 无 | `uint256` | 总质押数量 |
| `totalUserStaked()` | 无 | `uint256` | 用户质押总额 |
| `platformRevenue()` | 无 | `uint256` | 平台收益 |

### 需要调用的合约函数

| 函数名 | 参数 | Gas 估算 | 说明 |
|--------|------|----------|------|
| `stake(uint256 tier)` | 档位 ID | ~150,000 | 质押 ETH（需要发送 ETH） |
| `claimReward(uint256 stakeId)` | 质押 ID | ~80,000 | 领取奖励 |
| `unstake(uint256 stakeId)` | 质押 ID | ~100,000 | 正常赎回 |
| `unstakeEarly(uint256 stakeId)` | 质押 ID | ~100,000 | 提前赎回（扣 20% 罚金） |

### 数据结构

#### StakingTier（质押档位）
```typescript
{
  minAmount: bigint;      // 最小金额（wei）
  ydReward: bigint;       // YD 奖励数量
  lockPeriod: bigint;     // 锁定期（秒）
  apy: bigint;            // APY（基点，如 500 = 5%）
  isActive: boolean;       // 是否激活
}
```

#### Stake（质押记录）
```typescript
{
  stakeId: bigint;        // 质押 ID
  user: string;           // 用户地址
  ethAmount: bigint;      // 质押的 ETH 数量
  ydAmount: bigint;       // 获得的 YD 数量
  tier: bigint;           // 档位 ID
  startTime: bigint;      // 开始时间（时间戳）
  endTime: bigint;        // 结束时间（时间戳）
  claimedReward: bigint;  // 已领取的奖励
  isActive: boolean;      // 是否活跃
}
```

---

## 🎨 UI/UX 建议

### 水龙头页面
1. **主界面**:
   - 大号"领取"按钮（居中）
   - 显示倒计时（如果冷却中）
   - 显示水龙头余额
   - 显示统计信息（总领取数、总用户数）

2. **状态提示**:
   - 成功：绿色提示 "领取成功！获得 XXX YD"
   - 冷却中：黄色提示 "冷却中，剩余时间：XX:XX:XX"
   - 余额不足：红色提示 "水龙头余额不足"

### 质押页面
1. **档位选择**:
   - 卡片式布局展示所有档位
   - 每个档位显示：最小金额、YD 奖励、锁定期、APY
   - 高亮推荐档位（如 APY 最高的）

2. **质押表单**:
   - 输入框：质押金额（ETH）
   - 实时显示：预计获得的 YD 数量
   - 显示：预计 ETH 奖励（基于 APY 和锁定期）

3. **我的质押列表**:
   - 表格或卡片展示
   - 状态标签：活跃/已赎回/锁定中
   - 进度条：显示锁定期进度
   - 操作按钮：领取奖励、赎回

4. **奖励计算器**:
   - 侧边栏或弹窗
   - 输入：金额、档位
   - 输出：预计 YD 奖励、预计 ETH 奖励、总收益

---

## ⚠️ 注意事项

### 水龙头合约
1. **冷却时间**: 用户需要等待冷却时间才能再次领取
2. **余额检查**: 调用 `claim()` 前检查 `getFaucetBalance()` 是否足够
3. **错误处理**: 
   - "Need to wait for cooldown" → 显示倒计时
   - "Faucet is empty" → 提示水龙头已空

### 质押合约
1. **最小金额**: 用户质押金额必须 >= 档位的最小金额
2. **YD 余额**: 质押前检查合约是否有足够的 YD 发放奖励
3. **锁定期**: 用户需要等待锁定期结束后才能正常赎回
4. **提前赎回**: 会扣除 20% 罚金，需要明确提示用户
5. **奖励计算**: 奖励是实时计算的，基于已质押时间和 APY
6. **错误处理**:
   - "Invalid tier" → 档位不存在
   - "Tier not active" → 档位未激活
   - "Below minimum" → 金额低于最小要求
   - "Insufficient YD in contract" → 合约 YD 余额不足
   - "Lock period not ended" → 锁定期未结束（需要提前赎回）

---

## 📝 前端 AI 智能体需求总结

### 需要实现的功能模块

1. **水龙头模块** (`YDFaucet`)
   - 领取代币页面
   - 倒计时显示
   - 余额和统计信息展示

2. **质押模块** (`YDStakingSafe`)
   - 质押页面（档位选择、金额输入）
   - 我的质押列表
   - 领取奖励功能
   - 赎回功能（正常/提前）
   - 奖励计算器

### 技术要点

1. **状态管理**: 需要实时更新用户质押状态、奖励金额
2. **倒计时**: 水龙头冷却时间、质押锁定期倒计时
3. **交易处理**: 处理 ETH 转账（质押）、代币转账（领取）
4. **错误处理**: 友好的错误提示和状态反馈
5. **数据格式化**: 将 wei 转换为 ETH，bigint 转换为可读数字

### 建议的页面结构

```
/faucet          - 水龙头页面
/staking         - 质押页面
/staking/my      - 我的质押页面
/staking/calculator - 奖励计算器
```

---

## 🔗 相关文件

- 合约地址和 ABI: `deployments/frontend-config.json`
- 部署脚本: `scripts/03-deploy-faucet-staking.js`
- 合约源码: `contracts/YDFaucet.sol`, `contracts/YDStakingSafe.sol`


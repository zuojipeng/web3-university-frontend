import Head from 'next/head';
import { useState, useEffect } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import Link from 'next/link';
import {
  YD_TOKEN_ADDRESS,
  YD_TOKEN_ABI,
  INSTRUCTOR_YIELD_ADDRESS,
  INSTRUCTOR_YIELD_ABI,
} from '../config';
import { CURRENT_CHAIN_ID } from '../lib/wagmi';

/**
 * 作者理财页面 - Treasury Management
 * 功能：
 * 1. 查看课程收益（YD Token）
 * 2. YD → ETH → USDT 兑换（通过 Uniswap）
 * 3. USDT 存入 Aave 进行理财
 * 4. 查看 Aave 收益
 */

// Aave V3 Sepolia 测试网地址
const AAVE_POOL_ADDRESS = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'; // Aave V3 Pool on Sepolia
const USDT_ADDRESS = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'; // USDT on Sepolia

// Uniswap V3 Router 地址（Sepolia）
const UNISWAP_ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E'; // Uniswap SwapRouter on Sepolia

// 简化的 Uniswap Router ABI（只包含需要的函数）
const UNISWAP_ROUTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
          { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
        ],
        "internalType": "struct ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  }
];

// 简化的 Aave Pool ABI
const AAVE_POOL_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "onBehalfOf", "type": "address" },
      { "internalType": "uint16", "name": "referralCode", "type": "uint16" }
    ],
    "name": "supply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "withdraw",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ERC20 ABI（用于 USDT）
const ERC20_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

function TreasuryPage() {
  const [mounted, setMounted] = useState(false);
  const [swapStep, setSwapStep] = useState('idle'); // idle, approving, swapping, success, error
  const [aaveStep, setAaveStep] = useState('idle');
  const [ydAmount, setYdAmount] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // 读取 YD 余额
  const { data: ydBalance, refetch: refetchYdBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: YD_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address },
  });

  // 读取 USDT 余额
  const { data: usdtBalance, refetch: refetchUsdtBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address },
  });

  // 读取教师总收益（从 InstructorYieldManager）
  const { data: instructorYield } = useReadContract({
    address: INSTRUCTOR_YIELD_ADDRESS,
    abi: INSTRUCTOR_YIELD_ABI,
    functionName: 'getTotalYield',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!INSTRUCTOR_YIELD_ADDRESS },
  });

  // 读取已提取收益
  const { data: withdrawnYield } = useReadContract({
    address: INSTRUCTOR_YIELD_ADDRESS,
    abi: INSTRUCTOR_YIELD_ABI,
    functionName: 'getWithdrawnYield',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!INSTRUCTOR_YIELD_ADDRESS },
  });

  // 授权交易
  const { writeContract: writeApprove, data: approveTxHash } = useWriteContract();
  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // 兑换交易
  const { writeContract: writeSwap, data: swapTxHash } = useWriteContract();
  const { isLoading: isSwapping, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({ hash: swapTxHash });

  // Aave 存款交易
  const { writeContract: writeAaveSupply, data: aaveTxHash } = useWriteContract();
  const { isLoading: isAaveSupplying, isSuccess: isAaveSuccess } = useWaitForTransactionReceipt({ hash: aaveTxHash });

  // YD → ETH 兑换（第一步）
  const handleSwapYDToETH = async () => {
    if (!ydAmount || !address) return;

    try {
      setSwapStep('approving');
      
      // 1. 授权 YD 给 Uniswap Router
      const amountIn = parseUnits(ydAmount, 18);
      await writeApprove({
        address: YD_TOKEN_ADDRESS,
        abi: YD_TOKEN_ABI,
        functionName: 'approve',
        args: [UNISWAP_ROUTER, amountIn],
        chainId: CURRENT_CHAIN_ID,
      });

      // 等待授权完成后执行兑换
      // 注意：实际项目中需要监听授权交易完成后再调用兑换
      setSwapStep('swapping');
      
      // 2. 调用 Uniswap exactInputSingle 兑换
      await writeSwap({
        address: UNISWAP_ROUTER,
        abi: UNISWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: YD_TOKEN_ADDRESS,
          tokenOut: '0x0000000000000000000000000000000000000000', // WETH address (replace with actual)
          fee: 3000, // 0.3% fee tier
          recipient: address,
          amountIn: amountIn,
          amountOutMinimum: 0, // 生产环境需要设置合理的滑点
          sqrtPriceLimitX96: 0
        }],
        chainId: CURRENT_CHAIN_ID,
      });

    } catch (err) {
      console.error('兑换失败:', err);
      setSwapStep('error');
    }
  };

  // USDT → Aave 存款
  const handleSupplyToAave = async () => {
    if (!usdtAmount || !address) return;

    try {
      setAaveStep('approving');
      
      // 1. 授权 USDT 给 Aave Pool
      const amountIn = parseUnits(usdtAmount, 6); // USDT 是 6 位小数
      await writeApprove({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [AAVE_POOL_ADDRESS, amountIn],
        chainId: CURRENT_CHAIN_ID,
      });

      setAaveStep('supplying');
      
      // 2. 调用 Aave supply
      await writeAaveSupply({
        address: AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [
          USDT_ADDRESS,
          amountIn,
          address,
          0 // referral code
        ],
        chainId: CURRENT_CHAIN_ID,
      });

    } catch (err) {
      console.error('Aave 存款失败:', err);
      setAaveStep('error');
    }
  };

  useEffect(() => {
    if (isSwapSuccess) {
      setSwapStep('success');
      refetchYdBalance();
      refetchUsdtBalance();
    }
  }, [isSwapSuccess, refetchYdBalance, refetchUsdtBalance]);

  useEffect(() => {
    if (isAaveSuccess) {
      setAaveStep('success');
      refetchUsdtBalance();
    }
  }, [isAaveSuccess, refetchUsdtBalance]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        加载中...
      </div>
    );
  }

  const handleConnect = () => {
    const connector = connectors?.[0];
    if (connector) connect({ connector });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-green-900 to-gray-900 text-white">
      <Head>
        <title>作者理财中心 - Web3大学</title>
      </Head>

      {/* 导航栏 */}
      <nav className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center space-x-3">
              <span className="text-3xl">🚀</span>
              <span className="text-2xl font-bold text-purple-400">Web3大学</span>
            </Link>

            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-300 hover:text-white px-3 py-2">
                课程
              </Link>
              <Link href="/profile" className="text-gray-300 hover:text-white px-3 py-2">
                个人中心
              </Link>
              {isConnected && address ? (
                <>
                  <div className="bg-green-600 rounded-lg px-4 py-2">
                    <p className="text-green-100 text-xs">已连接</p>
                    <p className="text-white font-mono text-sm">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </p>
                  </div>
                  <button
                    onClick={() => disconnect()}
                    className="text-gray-400 hover:text-white"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnect}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
                >
                  连接钱包
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">💰 作者理财中心</h1>
          <p className="text-xl text-gray-400">
            将课程收益投资到 Aave，获得被动收入
          </p>
        </div>

        {!isConnected ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400 mb-4">请先连接钱包</p>
            <button
              onClick={handleConnect}
              className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition"
            >
              连接钱包
            </button>
          </div>
        ) : (
          <>
            {/* 资产概览 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-2">YD Token 余额</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {ydBalance ? formatUnits(ydBalance, 18) : '0'} YD
                </p>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-2">USDT 余额</p>
                <p className="text-3xl font-bold text-green-400">
                  {usdtBalance ? formatUnits(usdtBalance, 6) : '0'} USDT
                </p>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-2">Aave 存款</p>
                <p className="text-3xl font-bold text-blue-400">
                  0 USDT
                </p>
                <p className="text-gray-500 text-xs mt-1">+ 0 收益</p>
              </div>
            </div>

            {/* 兑换流程 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* YD → ETH → USDT */}
              <div className="bg-gray-800 rounded-lg p-6 border-2 border-green-500">
                <h2 className="text-2xl font-bold text-green-400 mb-4">
                  📊 步骤 1: YD → USDT
                </h2>
                <p className="text-gray-400 mb-4 text-sm">
                  通过 Uniswap 将 YD 代币兑换为 USDT（经由 ETH）
                </p>

                <div className="mb-4">
                  <label className="block text-gray-300 mb-2">兑换数量（YD）</label>
                  <input
                    type="number"
                    value={ydAmount}
                    onChange={(e) => setYdAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    可用: {ydBalance ? formatUnits(ydBalance, 18) : '0'} YD
                  </p>
                </div>

                <button
                  onClick={handleSwapYDToETH}
                  disabled={!ydAmount || swapStep === 'approving' || swapStep === 'swapping'}
                  className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50"
                >
                  {swapStep === 'approving' && '授权中...'}
                  {swapStep === 'swapping' && '兑换中...'}
                  {swapStep === 'success' && '✅ 兑换成功'}
                  {(swapStep === 'idle' || swapStep === 'error') && '开始兑换'}
                </button>

                {swapStep === 'error' && (
                  <p className="text-red-400 text-sm mt-2">
                    ⚠️ 兑换失败，请重试
                  </p>
                )}

                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500 rounded-lg text-yellow-300 text-xs">
                  💡 提示：兑换需要少量 Gas 费用。建议确保钱包有足够的 ETH。
                </div>
              </div>

              {/* USDT → Aave */}
              <div className="bg-gray-800 rounded-lg p-6 border-2 border-blue-500">
                <h2 className="text-2xl font-bold text-blue-400 mb-4">
                  🏦 步骤 2: 存入 Aave
                </h2>
                <p className="text-gray-400 mb-4 text-sm">
                  将 USDT 存入 Aave 协议，开始赚取利息
                </p>

                <div className="mb-4">
                  <label className="block text-gray-300 mb-2">存款数量（USDT）</label>
                  <input
                    type="number"
                    value={usdtAmount}
                    onChange={(e) => setUsdtAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    可用: {usdtBalance ? formatUnits(usdtBalance, 6) : '0'} USDT
                  </p>
                </div>

                <button
                  onClick={handleSupplyToAave}
                  disabled={!usdtAmount || aaveStep === 'approving' || aaveStep === 'supplying'}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50"
                >
                  {aaveStep === 'approving' && '授权中...'}
                  {aaveStep === 'supplying' && '存款中...'}
                  {aaveStep === 'success' && '✅ 存款成功'}
                  {(aaveStep === 'idle' || aaveStep === 'error') && '存入 Aave'}
                </button>

                {aaveStep === 'error' && (
                  <p className="text-red-400 text-sm mt-2">
                    ⚠️ 存款失败，请重试
                  </p>
                )}

                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500 rounded-lg text-blue-300 text-xs">
                  📈 当前 APY: ~3.5%（实时变化）
                  <br />
                  💰 利息每秒计算，可随时提取
                </div>
              </div>
            </div>

            {/* 操作说明 */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">📖 操作流程说明</h3>
              <div className="space-y-3 text-gray-300 text-sm">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">1️⃣</span>
                  <div>
                    <p className="font-semibold">兑换 YD → USDT</p>
                    <p className="text-gray-400">
                      通过 Uniswap 将课程收益（YD Token）兑换为稳定币 USDT
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="text-2xl">2️⃣</span>
                  <div>
                    <p className="font-semibold">存入 Aave 协议</p>
                    <p className="text-gray-400">
                      将 USDT 存入 Aave 流动性池，开始赚取利息（当前 APY ~3.5%）
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="text-2xl">3️⃣</span>
                  <div>
                    <p className="font-semibold">随时提取</p>
                    <p className="text-gray-400">
                      利息实时累积，可随时提取本金和收益，无锁定期
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 开发中提示 */}
            <div className="mt-8 bg-yellow-900/20 border border-yellow-500 rounded-lg p-6 text-center">
              <p className="text-yellow-400 font-semibold mb-2">
                🚧 开发中提示
              </p>
              <p className="text-gray-300 text-sm">
                此功能正在开发中。Uniswap 和 Aave 集成需要在 Sepolia 测试网部署相应的流动性池。
                <br />
                当前页面展示了完整的 UI 和交互流程，实际兑换功能需要确保测试网上有足够的流动性。
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default TreasuryPage;


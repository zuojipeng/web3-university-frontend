import Head from 'next/head';
import { useState, useEffect } from 'react';
import { formatUnits, parseEther } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import Link from 'next/link';
import { YD_FAUCET_ADDRESS, YD_FAUCET_ABI, YD_TOKEN_ADDRESS, YD_TOKEN_ABI } from '../config';

function FaucetPage() {
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // 读取水龙头配置
  const { data: faucetAmount } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'faucetAmount',
    query: { enabled: mounted && !!YD_FAUCET_ADDRESS },
  });

  const { data: cooldownTime } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'cooldownTime',
    query: { enabled: mounted && !!YD_FAUCET_ADDRESS },
  });

  const { data: canClaim } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'canClaim',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!YD_FAUCET_ADDRESS },
  });

  const { data: nextClaimTime } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'nextClaimTime',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!YD_FAUCET_ADDRESS },
  });

  const { data: faucetBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: YD_TOKEN_ABI,
    functionName: 'balanceOf',
    args: YD_FAUCET_ADDRESS ? [YD_FAUCET_ADDRESS] : undefined,
    query: { enabled: mounted && !!YD_FAUCET_ADDRESS },
  });

  const { data: totalClaimed } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'totalClaimed',
    query: { enabled: mounted && !!YD_FAUCET_ADDRESS },
  });

  const { data: totalUsers } = useReadContract({
    address: YD_FAUCET_ADDRESS,
    abi: YD_FAUCET_ABI,
    functionName: 'totalUsers',
    query: { enabled: mounted && !!YD_FAUCET_ADDRESS },
  });

  // 倒计时逻辑
  useEffect(() => {
    if (!nextClaimTime || !mounted) return;

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(nextClaimTime) - now;
      setCountdown(Math.max(0, remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextClaimTime, mounted]);

  // 领取交易
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleClaim = async () => {
    if (!canClaim || !address) return;

    try {
      await writeContract({
        address: YD_FAUCET_ADDRESS,
        abi: YD_FAUCET_ABI,
        functionName: 'claim',
      });
    } catch (err) {
      console.error('领取失败:', err);
    }
  };

  // 格式化倒计时
  const formatCountdown = (seconds) => {
    if (seconds <= 0) return '可以领取';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟 ${secs}秒`;
    if (minutes > 0) return `${minutes}分钟 ${secs}秒`;
    return `${secs}秒`;
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        加载中...
      </div>
    );
  }

  // 如果合约未部署，显示提示
  if (!YD_FAUCET_ADDRESS) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-blue-900 to-gray-900 text-white">
        <nav className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center space-x-3">
                <span className="text-3xl">🚀</span>
                <span className="text-2xl font-bold text-purple-400">Web3大学</span>
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-yellow-500">
            <p className="text-yellow-400 text-lg mb-2">⚠️ 水龙头合约未部署</p>
            <p className="text-gray-400">请在 frontend-config.json 中配置 YDFaucet 合约地址和 ABI</p>
          </div>
        </main>
      </div>
    );
  }

  const handleConnect = () => {
    const connector = connectors?.[0];
    if (connector) connect({ connector });
  };

  const isProcessing = isPending || isConfirming;
  const canClaimNow = canClaim === true && countdown === 0;
  const hasBalance = faucetBalance && faucetBalance > 0n;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-blue-900 to-gray-900 text-white">
      <Head>
        <title>Token Faucet - Web3 University</title>
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
              <Link href="/staking" className="text-gray-300 hover:text-white px-3 py-2">
                质押
              </Link>
              <Link href="/treasury" className="text-gray-300 hover:text-white px-3 py-2">
                理财
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">🚰 Token Faucet</h1>
          <p className="text-xl text-gray-400">
            Claim free YD tokens for testing and learning
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-2xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">总领取数量</p>
            <p className="text-2xl font-bold text-green-400">
              {totalClaimed ? formatUnits(totalClaimed, 18) : '0'} YD
            </p>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">总用户数</p>
            <p className="text-2xl font-bold text-purple-400">
              {totalUsers ? totalUsers.toString() : '0'}
            </p>
          </div>
        </div>

        {/* 领取区域 */}
        <div className="bg-gray-800 rounded-lg p-8 border-2 border-blue-500">
          {!isConnected ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">请先连接钱包</p>
              <button
                onClick={handleConnect}
                className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
              >
                连接钱包
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <p className="text-gray-400 mb-2">每次可领取</p>
                <p className="text-4xl font-bold text-blue-400 mb-4">
                  {faucetAmount ? formatUnits(faucetAmount, 18) : '0'} YD
                </p>
                
                {canClaimNow && hasBalance ? (
                  <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-4">
                    <p className="text-green-400 font-semibold">✅ 可以领取</p>
                  </div>
                ) : (
                  <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 mb-4">
                    <p className="text-yellow-400 font-semibold">
                      {!hasBalance ? '⚠️ 水龙头余额不足' : `⏳ 冷却中: ${formatCountdown(countdown)}`}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleClaim}
                  disabled={!canClaimNow || !hasBalance || isProcessing}
                  className={`px-8 py-4 rounded-lg font-bold text-lg transition ${
                    canClaimNow && hasBalance && !isProcessing
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {isPending ? '等待确认...' : '确认中...'}
                    </span>
                  ) : (
                    '领取 YD 代币'
                  )}
                </button>
              </div>

              {isSuccess && (
                <div className="mt-4 bg-green-900/20 border border-green-500 rounded-lg p-4 text-center">
                  <p className="text-green-400 font-semibold">🎉 领取成功！</p>
                  <p className="text-gray-400 text-sm mt-1">
                    已获得 {faucetAmount ? formatUnits(faucetAmount, 18) : '0'} YD
                  </p>
                </div>
              )}

              {writeError && (
                <div className="mt-4 bg-red-900/20 border border-red-500 rounded-lg p-4 text-center">
                  <p className="text-red-400 text-sm">
                    {writeError?.shortMessage?.includes('cooldown') 
                      ? '冷却时间未到，请稍后再试'
                      : writeError?.shortMessage || '领取失败，请重试'}
                  </p>
                </div>
              )}

              {cooldownTime && (
                <div className="mt-6 text-center text-gray-500 text-sm">
                  <p>冷却时间: {Number(cooldownTime)} 秒 ({Math.floor(Number(cooldownTime) / 60)} 分钟)</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 说明信息 */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-400 mb-3">💡 使用说明</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• 每次领取需要等待冷却时间（{cooldownTime ? Math.floor(Number(cooldownTime) / 60) : 'N/A'} 分钟）</li>
            <li>• 每次可领取 {faucetAmount ? formatUnits(faucetAmount, 18) : '0'} YD 代币</li>
            <li>• 水龙头余额不足时将无法领取</li>
            <li>• 领取的代币可用于购买课程或参与质押</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default FaucetPage;

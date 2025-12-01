import Head from 'next/head';
import { useState, useEffect } from 'react';
import { formatUnits, parseEther } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import Link from 'next/link';
import { YD_STAKING_ADDRESS, YD_STAKING_ABI } from '../config';

function StakingPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [activeTab, setActiveTab] = useState('stake'); // 'stake' or 'my-stakes'

  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // 读取所有档位
  const { data: allTiers, refetch: refetchTiers } = useReadContract({
    address: YD_STAKING_ADDRESS,
    abi: YD_STAKING_ABI,
    functionName: 'getAllTiers',
    query: { enabled: mounted && !!YD_STAKING_ADDRESS },
  });

  // 读取用户质押记录
  const { data: userStakes, refetch: refetchStakes } = useReadContract({
    address: YD_STAKING_ADDRESS,
    abi: YD_STAKING_ABI,
    functionName: 'getUserStakes',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!YD_STAKING_ADDRESS },
  });

  // 读取活跃质押
  const { data: activeStakes } = useReadContract({
    address: YD_STAKING_ADDRESS,
    abi: YD_STAKING_ABI,
    functionName: 'getActiveStakes',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!YD_STAKING_ADDRESS },
  });

  // 质押交易
  const { writeContract: writeStake, data: stakeTxHash, isPending: isStaking } = useWriteContract();
  const { isLoading: isStakeConfirming, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({ hash: stakeTxHash });

  // 领取奖励交易
  const { writeContract: writeClaimReward, data: claimTxHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // 赎回交易
  const { writeContract: writeUnstake, data: unstakeTxHash, isPending: isUnstaking } = useWriteContract();
  const { isLoading: isUnstakeConfirming, isSuccess: isUnstakeSuccess } = useWaitForTransactionReceipt({ hash: unstakeTxHash });

  // 提前赎回交易
  const { writeContract: writeUnstakeEarly, data: unstakeEarlyTxHash, isPending: isUnstakingEarly } = useWriteContract();
  const { isLoading: isUnstakeEarlyConfirming, isSuccess: isUnstakeEarlySuccess } = useWaitForTransactionReceipt({ hash: unstakeEarlyTxHash });

  // 成功后的刷新
  useEffect(() => {
    if (isStakeSuccess || isClaimSuccess || isUnstakeSuccess || isUnstakeEarlySuccess) {
      refetchTiers();
      refetchStakes();
    }
  }, [isStakeSuccess, isClaimSuccess, isUnstakeSuccess, isUnstakeEarlySuccess, refetchTiers, refetchStakes]);

  const handleStake = async () => {
    if (!selectedTier || !stakeAmount || !address) return;

    const amount = parseEther(stakeAmount);
    const minAmount = selectedTier.minAmount || 0n;

    if (amount < minAmount) {
      alert(`质押金额必须 >= ${formatUnits(minAmount, 18)} ETH`);
      return;
    }

    try {
      await writeStake({
        address: YD_STAKING_ADDRESS,
        abi: YD_STAKING_ABI,
        functionName: 'stake',
        args: [BigInt(selectedTier.tier || 0)],
        value: amount,
      });
    } catch (err) {
      console.error('质押失败:', err);
    }
  };

  const handleClaimReward = async (stakeId) => {
    try {
      await writeClaimReward({
        address: YD_STAKING_ADDRESS,
        abi: YD_STAKING_ABI,
        functionName: 'claimReward',
        args: [BigInt(stakeId)],
      });
    } catch (err) {
      console.error('领取奖励失败:', err);
    }
  };

  const handleUnstake = async (stakeId, isEarly = false) => {
    try {
      if (isEarly) {
        await writeUnstakeEarly({
          address: YD_STAKING_ADDRESS,
          abi: YD_STAKING_ABI,
          functionName: 'unstakeEarly',
          args: [BigInt(stakeId)],
        });
      } else {
        await writeUnstake({
          address: YD_STAKING_ADDRESS,
          abi: YD_STAKING_ABI,
          functionName: 'unstake',
          args: [BigInt(stakeId)],
        });
      }
    } catch (err) {
      console.error('赎回失败:', err);
    }
  };

  // 格式化档位数据（需要先定义，因为后面会用到）
  const tiers = Array.isArray(allTiers) ? allTiers : [];
  const stakesRaw = activeTab === 'stake' ? activeStakes : userStakes;
  const stakes = Array.isArray(stakesRaw) ? stakesRaw : [];

  // 批量计算奖励（为所有活跃质押）
  const rewardContracts = stakes
    .filter((stake) => {
      const stakeData = Array.isArray(stake) ? { stakeId: stake[0], isActive: stake[8] } : stake;
      return stakeData.isActive && stakeData.stakeId;
    })
    .map((stake) => {
      const stakeData = Array.isArray(stake) ? { stakeId: stake[0] } : stake;
      return {
        address: YD_STAKING_ADDRESS,
        abi: YD_STAKING_ABI,
        functionName: 'calculateReward',
        args: [BigInt(stakeData.stakeId || 0)],
      };
    });

  const { data: rewardsData } = useReadContracts({
    contracts: rewardContracts,
    query: { enabled: mounted && !!address && stakes.length > 0 && !!YD_STAKING_ADDRESS },
  });

  // 创建奖励映射
  const rewardsMap = new Map();
  if (rewardsData && stakes.length > 0) {
    let rewardIndex = 0;
    stakes.forEach((stake) => {
      const stakeData = Array.isArray(stake) ? { stakeId: stake[0], isActive: stake[8] } : stake;
      if (stakeData.isActive && stakeData.stakeId && rewardsData[rewardIndex]) {
        const reward = rewardsData[rewardIndex].status === 'success' ? rewardsData[rewardIndex].result : 0n;
        rewardsMap.set(stakeData.stakeId?.toString(), reward);
        rewardIndex++;
      }
    });
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        加载中...
      </div>
    );
  }

  // 如果合约未部署，显示提示
  if (!YD_STAKING_ADDRESS) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white">
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-yellow-500">
            <p className="text-yellow-400 text-lg mb-2">⚠️ 质押合约未部署</p>
            <p className="text-gray-400">请在 frontend-config.json 中配置 YDStakingSafe 合约地址和 ABI</p>
          </div>
        </main>
      </div>
    );
  }

  const handleConnect = () => {
    const connector = connectors?.[0];
    if (connector) connect({ connector });
  };

  const isProcessing = isStaking || isStakeConfirming || isClaiming || isClaimConfirming || isUnstaking || isUnstakeConfirming || isUnstakingEarly || isUnstakeEarlyConfirming;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white">
      <Head>
        <title>YD 质押 - Web3大学</title>
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
              <Link href="/faucet" className="text-gray-300 hover:text-white px-3 py-2">
                水龙头
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
          <h1 className="text-5xl font-bold text-white mb-4">💎 YD 质押</h1>
          <p className="text-xl text-gray-400">
            质押 ETH，获得 YD 代币奖励
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-800 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setActiveTab('stake')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                activeTab === 'stake'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              质押
            </button>
            <button
              onClick={() => setActiveTab('my-stakes')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                activeTab === 'my-stakes'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              我的质押
            </button>
          </div>
        </div>

        {activeTab === 'stake' ? (
          <div>
            {!isConnected ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <p className="text-gray-400 mb-4">请先连接钱包</p>
                <button
                  onClick={handleConnect}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
                >
                  连接钱包
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 档位选择 */}
                <div className="lg:col-span-2">
                  <h2 className="text-2xl font-bold mb-6">选择质押档位</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tiers.map((tier, index) => {
                      const tierData = Array.isArray(tier) ? {
                        minAmount: tier[0],
                        ydReward: tier[1],
                        lockPeriod: tier[2],
                        apy: tier[3],
                        isActive: tier[4],
                      } : tier;

                      if (!tierData.isActive) return null;

                      const isSelected = selectedTier?.tier === index;
                      const apyPercent = tierData.apy ? Number(tierData.apy) / 100 : 0;

                      return (
                        <div
                          key={index}
                          onClick={() => setSelectedTier({ ...tierData, tier: index })}
                          className={`bg-gray-800 rounded-lg p-6 border-2 cursor-pointer transition ${
                            isSelected
                              ? 'border-purple-500 bg-purple-900/20'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">档位 {index + 1}</h3>
                            {isSelected && (
                              <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                                已选择
                              </span>
                            )}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">最小金额:</span>
                              <span className="text-white font-semibold">
                                {formatUnits(tierData.minAmount || 0n, 18)} ETH
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">YD 奖励:</span>
                              <span className="text-green-400 font-semibold">
                                {formatUnits(tierData.ydReward || 0n, 18)} YD
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">锁定期:</span>
                              <span className="text-white">
                                {tierData.lockPeriod ? Math.floor(Number(tierData.lockPeriod) / 86400) : 0} 天
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">APY:</span>
                              <span className="text-blue-400 font-bold">
                                {apyPercent.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 质押表单 */}
                <div className="lg:col-span-1">
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 sticky top-4">
                    <h2 className="text-xl font-bold mb-6">质押 ETH</h2>
                    
                    {selectedTier ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-gray-300 mb-2">质押金额 (ETH)</label>
                          <input
                            type="number"
                            value={stakeAmount}
                            onChange={(e) => setStakeAmount(e.target.value)}
                            placeholder={`最小 ${formatUnits(selectedTier.minAmount || 0n, 18)} ETH`}
                            min={formatUnits(selectedTier.minAmount || 0n, 18)}
                            step="0.001"
                            className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            disabled={isProcessing}
                          />
                          <p className="text-gray-500 text-xs mt-1">
                            最小: {formatUnits(selectedTier.minAmount || 0n, 18)} ETH
                          </p>
                        </div>

                        <div className="bg-gray-700 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400">预计获得:</span>
                            <span className="text-green-400 font-semibold">
                              {formatUnits(selectedTier.ydReward || 0n, 18)} YD
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">锁定期:</span>
                            <span className="text-white">
                              {selectedTier.lockPeriod ? Math.floor(Number(selectedTier.lockPeriod) / 86400) : 0} 天
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={handleStake}
                          disabled={!stakeAmount || isProcessing || parseEther(stakeAmount || '0') < selectedTier.minAmount}
                          className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? '处理中...' : '确认质押'}
                        </button>

                        {isStakeSuccess && (
                          <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 text-center">
                            <p className="text-green-400 text-sm">✅ 质押成功！</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center py-8">请先选择一个档位</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {!isConnected ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <p className="text-gray-400 mb-4">请先连接钱包查看质押记录</p>
                <button
                  onClick={handleConnect}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
                >
                  连接钱包
                </button>
              </div>
            ) : stakes.length === 0 ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <p className="text-gray-400">暂无质押记录</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-6">我的质押记录</h2>
                {stakes.map((stake, index) => {
                  const stakeData = Array.isArray(stake) ? {
                    stakeId: stake[0],
                    user: stake[1],
                    ethAmount: stake[2],
                    ydAmount: stake[3],
                    tier: stake[4],
                    startTime: stake[5],
                    endTime: stake[6],
                    claimedReward: stake[7],
                    isActive: stake[8],
                  } : stake;

                  const now = Math.floor(Date.now() / 1000);
                  const isLocked = Number(stakeData.endTime) > now;
                  const lockProgress = stakeData.startTime && stakeData.endTime
                    ? Math.min(100, ((now - Number(stakeData.startTime)) / (Number(stakeData.endTime) - Number(stakeData.startTime))) * 100)
                    : 0;
                  
                  // 获取可领取奖励
                  const totalReward = rewardsMap.get(stakeData.stakeId?.toString()) || 0n;
                  const claimedReward = stakeData.claimedReward || 0n;
                  const claimableReward = totalReward > claimedReward ? totalReward - claimedReward : 0n;

                  return (
                    <div key={index} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-lg font-bold mb-4">质押 #{stakeData.stakeId?.toString()}</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">质押金额:</span>
                              <span className="text-white font-semibold">
                                {formatUnits(stakeData.ethAmount || 0n, 18)} ETH
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">YD 奖励:</span>
                              <span className="text-green-400 font-semibold">
                                {formatUnits(stakeData.ydAmount || 0n, 18)} YD
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">档位:</span>
                              <span className="text-white">档位 {Number(stakeData.tier || 0) + 1}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">状态:</span>
                              <span className={`font-semibold ${stakeData.isActive ? 'text-green-400' : 'text-gray-400'}`}>
                                {stakeData.isActive ? '活跃' : '已赎回'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-400">锁定期进度</span>
                              <span className="text-white">{lockProgress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${lockProgress}%` }}
                              />
                            </div>
                          </div>

                          {stakeData.isActive && (
                            <div className="space-y-3">
                              {claimableReward > 0n && (
                                <div className="bg-green-900/20 border border-green-500 rounded-lg p-2 mb-2">
                                  <p className="text-green-400 text-xs">可领取奖励</p>
                                  <p className="text-green-300 font-semibold">
                                    {formatUnits(claimableReward, 18)} YD
                                  </p>
                                </div>
                              )}
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => handleClaimReward(stakeData.stakeId)}
                                  disabled={isProcessing || claimableReward === 0n}
                                  className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                >
                                  领取奖励
                                </button>
                                {isLocked ? (
                                  <button
                                    onClick={() => handleUnstake(stakeData.stakeId, true)}
                                    disabled={isProcessing}
                                    className="bg-yellow-600 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 transition disabled:opacity-50 text-sm"
                                  >
                                    提前赎回 (扣 20% 罚金)
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleUnstake(stakeData.stakeId, false)}
                                    disabled={isProcessing}
                                    className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                                  >
                                    正常赎回
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default StakingPage;

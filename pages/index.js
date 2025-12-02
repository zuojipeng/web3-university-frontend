import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { formatUnits } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useChainId,
} from 'wagmi';
import Link from 'next/link';
import { 
  YD_TOKEN_ADDRESS, 
  YD_TOKEN_ABI, 
} from '../config';
import { CURRENT_CHAIN_ID, IS_LOCAL_CHAIN } from '../lib/wagmi';
import CreateCourseModal from '../components/CreateCourseModal';
import PurchaseCourseModal from '../components/PurchaseCourseModal';
import CourseContentViewer from '../components/CourseContentViewer';
import CourseList from '../components/CourseList';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected, chainId: walletChainId } = useAccount();
  const chainId = useChainId(); // 使用独立的 chainId hook

  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  
  // 统一处理 chainId 格式（可能是 number、BigInt 或 hex string）
  const normalizeChainId = (id) => {
    if (!id) return null;
    if (typeof id === 'number') return id;
    if (typeof id === 'bigint') return Number(id);
    if (typeof id === 'string') {
      // 如果是十六进制字符串（0x开头），转换为数字
      if (id.startsWith('0x')) {
        return parseInt(id, 16);
      }
      // 如果是纯数字字符串，直接转换
      return parseInt(id, 10);
    }
    return null;
  };

  // 使用 chainId 或 walletChainId（优先使用 chainId），并统一格式
  const currentChainId = normalizeChainId(chainId) || normalizeChainId(walletChainId);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isContentViewerOpen, setIsContentViewerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [viewingCourse, setViewingCourse] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false); // 切换网络中的简单状态

  // 读取 YD 代币余额（根据当前配置的网络读取）
  const { data: ydBalance, refetch: refetchBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: YD_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      // 根据环境变量决定的目标链 ID
      enabled: mounted && !!address && currentChainId === CURRENT_CHAIN_ID,
    },
  });

  const handleCourseCreated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    refetchBalance();
  }, [refetchBalance]);

  // 目标网络名称（根据环境变量）
  const targetNetworkName = IS_LOCAL_CHAIN ? 'Hardhat 本地链' : 'Sepolia 测试网';
  const targetChainIdHex = IS_LOCAL_CHAIN ? '0x7a69' : '0xaa36a7'; // 31337 或 11155111

  // 添加目标网络到 MetaMask
  const addTargetNetwork = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('请安装 MetaMask 钱包');
      return false;
    }

    const networkConfig = IS_LOCAL_CHAIN
      ? {
          chainId: '0x7a69', // 31337 in hex
          chainName: 'Hardhat Local',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['http://127.0.0.1:8545'],
          blockExplorerUrls: [],
        }
      : {
          chainId: '0xaa36a7', // 11155111 in hex
          chainName: 'Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia.drpc.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        };

    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [networkConfig],
      });
      return true;
    } catch (err) {
      console.error(`添加 ${targetNetworkName} 网络失败:`, err);
      return false;
    }
  };

  // 手动切换到目标网络
  const switchToTargetNetwork = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('请安装 MetaMask 钱包');
      return;
    }

    setIsSwitching(true);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (err) {
      console.error(`切换到 ${targetNetworkName} 失败:`, err);
      // 如果网络未添加，尝试先添加再切换
      if (err.code === 4902) {
        const added = await addTargetNetwork();
        if (added) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: targetChainIdHex }],
            });
          } catch (err2) {
            console.error(`添加后切换 ${targetNetworkName} 仍失败:`, err2);
          }
        }
      }
    } finally {
      setIsSwitching(false);
    }
  }, [targetChainIdHex, targetNetworkName]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        加载中...
      </div>
    );
  }

  const handleConnect = async () => {
    const connector = connectors?.[0];
    if (!connector) {
      alert('未找到可用的钱包连接器，请检查 Wagmi 配置。');
      return;
    }
    
    try {
      // console.log('正在连接钱包...');
      await connect({ connector });
      // console.log('✅ 钱包连接成功');

      // 连接成功后，如果不是目标网络，尝试切换一次
      try {
        const chainIdHex = await window.ethereum?.request({ method: 'eth_chainId' });
        const chainNum = normalizeChainId(chainIdHex);
        // console.log('连接后检查链 ID:', chainNum, '(目标链 ID:', CURRENT_CHAIN_ID, ')');
        if (chainNum !== CURRENT_CHAIN_ID) {
          // console.log(`⚠️ 连接后检测到非 ${targetNetworkName} 网络，尝试切换...`);
          await switchToTargetNetwork();
        }
      } catch (checkErr) {
        console.error('检查或切换链 ID 失败:', checkErr);
      }
    } catch (err) {
      console.error('连接钱包失败:', err);
    }
  };

  const handleSelectCourse = () => {
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  const handlePurchaseClick = (course) => {
    setSelectedCourse(course);
    setIsPurchaseModalOpen(true);
  };

  const handlePurchaseSuccess = () => {
    refetchBalance();
    setRefreshKey((prev) => prev + 1);
  };

  const handleViewContent = (course) => {
    setViewingCourse(course);
    setIsContentViewerOpen(true);
  };

  const displayBalance = ydBalance ? formatUnits(ydBalance, 18) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* 顶部导航栏 */}
      <nav className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🚀</span>
              <span className="text-2xl font-bold text-purple-400">Web3大学</span>
            </div>

                    <div className="flex items-center space-x-4">
                      <Link href="/faucet" className="text-gray-300 hover:text-white px-3 py-2 text-sm">
                        水龙头
                      </Link>
                      <Link href="/staking" className="text-gray-300 hover:text-white px-3 py-2 text-sm">
                        质押
                      </Link>
                      <Link href="/treasury" className="text-gray-300 hover:text-white px-3 py-2 text-sm">
                        理财
                      </Link>
                      <Link href="/profile" className="text-gray-300 hover:text-white px-3 py-2 text-sm">
                        个人中心
                      </Link>
                      {isConnected && address ? (
                <>
                  <div className="bg-gray-700 rounded-lg px-4 py-2">
                    <p className="text-gray-400 text-xs">YD 余额</p>
                    <p className="text-white font-semibold">{displayBalance}</p>
                  </div>

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
                  disabled={isConnecting}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
            >
                  {isConnecting ? '连接中...' : '连接钱包'}
            </button>
          )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero 区域 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">探索去中心化未来！</h1>
          <p className="text-xl text-gray-400 mb-4">
            通过区块链技术和智能合约，解锁前所未有的学习体验
          </p>
          <div className="text-sm">
            {!isConnected ? (
              <p className="text-gray-400">未连接钱包</p>
            ) : currentChainId === CURRENT_CHAIN_ID ? (
              <div className="flex items-center justify-center space-x-2">
                <span className="text-green-400 font-semibold">✓ {targetNetworkName} ({CURRENT_CHAIN_ID})</span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400">已就绪</span>
              </div>
            ) : currentChainId ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400 font-semibold">⚠️ 当前网络: Chain ID {currentChainId}</span>
                  <span className="text-gray-500">•</span>
                  <span className="text-red-400">需要切换到 {targetNetworkName}</span>
                </div>
                <button
                  onClick={switchToTargetNetwork}
                  disabled={isSwitching}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSwitching ? (
                    <span className="flex items-center space-x-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>切换中...</span>
                    </span>
                  ) : (
                    `🔀 切换到 ${targetNetworkName}`
                  )}
                </button>
                <p className="text-gray-500 text-xs">请切换到 {targetNetworkName} 以使用所有功能</p>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-gray-400">检测网络状态...</span>
              </div>
            )}
          </div>
        </div>

        {/* 功能卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-gray-800 border-2 border-purple-500 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-purple-400 mb-4">成为一名教育者</h2>
            <p className="text-gray-400 mb-6">创建您的第一个 Web3 课程，赚取 YD 代币！</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              disabled={!isConnected}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {isConnected ? '创建新课程' : '请先连接钱包'}
            </button>
          </div>

          <div className="bg-gray-800 border-2 border-blue-500 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-blue-400 mb-4">探索学习之旅</h2>
            <p className="text-gray-400 mb-6">通过 YD 代币购买您喜欢的去中心化课程</p>
            <div className="bg-gray-700 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-sm">向下滚动查看所有课程</p>
              <svg
                className="w-6 h-6 text-blue-400 mx-auto mt-2 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
        </div>

        {/* 课程列表 */}
        <div>
          <h2 className="text-3xl font-bold text-center text-orange-400 mb-8">热门课程</h2>

          {!isConnected ? (
            <div className="text-center py-12 bg-gray-800 rounded-lg">
              <p className="text-gray-400 mb-4">请先连接钱包查看课程</p>
              <button
                onClick={handleConnect}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
              >
                连接钱包
              </button>
                </div>
          ) : (
            <CourseList
              onSelectCourse={handleSelectCourse}
              onPurchaseClick={handlePurchaseClick}
              onViewContent={handleViewContent}
              key={refreshKey}
            />
            )}
          </div>
      </main>

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCourseCreated}
      />

      <PurchaseCourseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => {
          setIsPurchaseModalOpen(false);
          setSelectedCourse(null);
        }}
        course={selectedCourse}
        onSuccess={handlePurchaseSuccess}
      />

      <CourseContentViewer
        isOpen={isContentViewerOpen}
        onClose={() => {
          setIsContentViewerOpen(false);
          setViewingCourse(null);
        }}
        contentHash={viewingCourse?.contentHash}
        courseName={viewingCourse?.name}
        courseId={viewingCourse?.id}
        courseAuthor={viewingCourse?.author}
      />
    </div>
  );
}

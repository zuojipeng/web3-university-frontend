import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { formatUnits } from 'viem';
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
import {
  COURSE_PURCHASE_ADDRESS,
  COURSE_PURCHASE_ABI,
  COURSE_PLATFORM_ADDRESS,
  COURSE_PLATFORM_ABI,
  USER_PROFILE_ADDRESS,
  USER_PROFILE_ABI,
} from '../config';
import { CURRENT_CHAIN_ID } from '../lib/wagmi';

/**
 * 用户个人中心页面 - User Profile
 * 功能：
 * 1. 通过 MetaMask 签名修改用户名
 * 2. 查看已购买的课程列表
 * 3. 展示学习统计（购买数量、总花费等）
 */

function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [purchasedCourses, setPurchasedCourses] = useState([]);
  const [formError, setFormError] = useState(''); // 表单验证错误

  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // 从 UserProfile 合约读取用户名
  const { data: profileData, refetch: refetchProfile } = useReadContract({
    address: USER_PROFILE_ADDRESS,
    abi: USER_PROFILE_ABI,
    functionName: 'getProfile',
    args: address ? [address] : undefined,
    query: { enabled: mounted && !!address && !!USER_PROFILE_ADDRESS },
  });

  // 更新用户名交易
  const { writeContract, writeContractAsync, data: txHash, isPending: isUpdating, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // 从合约读取用户名
  useEffect(() => {
    if (!profileData || !address) return;
    
    // profileData 格式: { name, createdAt, lastUpdated } 或 [name, createdAt, lastUpdated]
    const fetchedUsername = profileData.name || profileData[0] || '';
    
    // console.log('📖 读取到的用户资料:', profileData);
    // console.log('📖 用户名:', fetchedUsername);
    
    if (fetchedUsername && fetchedUsername !== '') {
      setUsername(fetchedUsername);
    } else {
      setUsername(`User ${address.slice(0, 6)}`);
    }
  }, [profileData, address]);

  // 交易成功后刷新
  useEffect(() => {
    if (isTxSuccess && txHash) {
      // console.log('✅ 用户名更新成功，交易哈希:', txHash);
      // 更新页面显示的用户名
      setUsername(newUsername);
      // 刷新合约数据
      refetchProfile();
      // 关闭编辑弹窗
      setIsEditingName(false);
      setNewUsername('');
      // 不再使用 alert，直接更新页面
    }
  }, [isTxSuccess, txHash, newUsername, refetchProfile]);

  // 获取所有课程 ID
  const { data: allCourseIds } = useReadContract({
    address: COURSE_PLATFORM_ADDRESS,
    abi: COURSE_PLATFORM_ABI,
    functionName: 'getAllCourseIds',
    query: { enabled: mounted && !!address },
  });

  // 批量检查购买状态
  const purchaseCheckContracts = (allCourseIds || []).map((courseId) => ({
    address: COURSE_PURCHASE_ADDRESS,
    abi: COURSE_PURCHASE_ABI,
    functionName: 'hasPurchased',
    args: [address, courseId],
  }));

  const { data: purchaseStatuses } = useReadContracts({
    contracts: purchaseCheckContracts,
    query: { enabled: mounted && !!address && allCourseIds && allCourseIds.length > 0 },
  });

  // 获取已购买课程的详情
  const purchasedCourseIds = (allCourseIds || []).filter((_, index) => {
    const status = purchaseStatuses?.[index];
    return status?.status === 'success' && status?.result === true;
  });

  const courseDetailsContracts = purchasedCourseIds.map((courseId) => ({
    address: COURSE_PLATFORM_ADDRESS,
    abi: COURSE_PLATFORM_ABI,
    functionName: 'getCourse',
    args: [courseId],
  }));

  const { data: courseDetails } = useReadContracts({
    contracts: courseDetailsContracts,
    query: { enabled: mounted && !!address && purchasedCourseIds.length > 0 },
  });

  // 格式化已购买的课程数据
  useEffect(() => {
    if (!courseDetails) return;

    const courses = courseDetails.map((result, index) => {
      if (result.status !== 'success') return null;

      const course = result.result;
      const courseId = purchasedCourseIds[index];

      return {
        id: courseId?.toString() || '',
        name: course.name || course[1] || '',
        description: course.description || course[2] || '',
        price: course.price || course[3] || 0n,
        priceDisplay: course.price ? formatUnits(course.price, 18) : '0',
        author: course.instructor || course.author || course[4] || '',
        contentHash: course.contentHash || course[8] || '',
      };
    }).filter(Boolean);

    setPurchasedCourses(courses);
  }, [courseDetails, purchasedCourseIds]);

  // 修改用户名（调用合约）
  const handleSaveUsername = async () => {
    // 清除之前的错误
    setFormError('');

    if (!newUsername.trim()) {
      setFormError('用户名不能为空');
      return;
    }

    if (newUsername.length > 50) {
      setFormError('用户名不能超过 50 个字符');
      return;
    }

    if (!USER_PROFILE_ADDRESS) {
      setFormError('UserProfile 合约未部署，请检查配置');
      console.error('❌ USER_PROFILE_ADDRESS 未定义');
      return;
    }

    if (!address) {
      setFormError('请先连接钱包');
      return;
    }

    try {
      // console.log('📝 准备调用 updateName...');

      // 使用 writeContractAsync 获取交易哈希
      const hash = await writeContractAsync({
        address: USER_PROFILE_ADDRESS,
        abi: USER_PROFILE_ABI,
        functionName: 'updateName',
        args: [newUsername],
      });

      // console.log('✅ 交易已发送，交易哈希:', hash);
    } catch (err) {
      console.error('❌ 更新用户名失败:', err);
      
      // 解析错误信息并显示在表单中
      if (err?.shortMessage) {
        setFormError(err.shortMessage);
      } else if (err?.message?.includes('User rejected')) {
        setFormError('用户取消了交易');
      } else if (err?.message?.includes('insufficient funds')) {
        setFormError('ETH 余额不足以支付 Gas 费用');
      } else {
        setFormError(err?.message || '更新失败，请重试');
      }
    }
  };

  // 计算统计数据
  const totalSpent = purchasedCourses.reduce((sum, course) => {
    return sum + parseFloat(course.priceDisplay);
  }, 0);

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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white">
      <Head>
        <title>个人中心 - Web3大学</title>
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
              <Link href="/treasury" className="text-gray-300 hover:text-white px-3 py-2">
                理财中心
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
        {!isConnected ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400 mb-4">请先连接钱包查看个人中心</p>
            <button
              onClick={handleConnect}
              className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition"
            >
              连接钱包
            </button>
          </div>
        ) : (
          <>
            {/* 用户信息卡片 */}
            <div className="bg-gray-800 rounded-lg p-8 mb-8 border-2 border-purple-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  {/* 头像占位符 */}
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-3xl">
                    👤
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-white">{username}</h2>
                    <p className="text-gray-400 font-mono text-sm mt-1">
                      {address}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditingName(true)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
                >
                  ✏️ 编辑资料
                </button>
              </div>

              {/* 统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">已购买课程</p>
                  <p className="text-3xl font-bold text-purple-400">
                    {purchasedCourses.length}
                  </p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">总花费</p>
                  <p className="text-3xl font-bold text-yellow-400">
                    {totalSpent.toFixed(2)} YD
                  </p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">学习进度</p>
                  <p className="text-3xl font-bold text-green-400">
                    0 / {purchasedCourses.length}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">已完成课程</p>
                </div>
              </div>
            </div>

            {/* 已购买的课程列表 */}
            <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-6">📚 我的课程</h3>

              {purchasedCourses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">
                    你还没有购买任何课程
                  </p>
                  <Link
                    href="/"
                    className="inline-block bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
                  >
                    去浏览课程
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {purchasedCourses.map((course) => (
                    <div
                      key={course.id}
                      className="bg-gray-700 rounded-lg p-6 hover:bg-gray-600 transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="text-xl font-bold text-white">
                          {course.name}
                        </h4>
                        <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                          已购买
                        </span>
                      </div>

                      <p className="text-gray-300 text-sm mb-4 line-clamp-2">
                        {course.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-gray-400 text-xs">购买价格</p>
                          <p className="text-yellow-400 font-semibold">
                            {course.priceDisplay} YD
                          </p>
                        </div>

                        <Link
                          href={`/?courseId=${course.id}`}
                          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm"
                        >
                          查看课程
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 安全提示 */}
            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-6">
              <h4 className="text-lg font-bold text-blue-400 mb-2">
                💾 关于链上存储
              </h4>
              <p className="text-gray-300 text-sm">
                你的用户名存储在 <strong>UserProfile</strong> 智能合约中。
                数据永久保存在区块链上，任何人都可以验证真实性。
                修改用户名需要发送交易，会消耗少量 Gas 费用（本地链免费）。
              </p>
            </div>
          </>
        )}
      </main>

      {/* 编辑用户名弹窗 */}
      {isEditingName && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">✏️ 编辑用户名</h3>
              <button
                onClick={() => {
                  setIsEditingName(false);
                  setNewUsername('');
                  setFormError('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-gray-300 mb-2">新用户名</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="输入新用户名"
                maxLength={50}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                {newUsername.length}/50 字符
              </p>
            </div>

            {/* 表单验证错误 */}
            {formError && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">⚠️ {formError}</p>
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                💾 用户名将存储在区块链上
                <br />
                ⚠️ 需要支付少量 Gas 费用
                <br />
                ✅ 数据永久保存，无法篡改
              </p>
            </div>

            <button
              onClick={handleSaveUsername}
              disabled={isUpdating || isConfirming || !newUsername.trim()}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating && (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>等待钱包确认...</span>
                </span>
              )}
              {isConfirming && (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>交易确认中...</span>
                </span>
              )}
              {!isUpdating && !isConfirming && '保存到链上'}
            </button>

            {writeError && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 mt-3">
                <p className="text-red-400 text-sm">
                  ❌ {writeError.shortMessage || writeError.message || '交易失败'}
                </p>
              </div>
            )}

            {txHash && !isTxSuccess && !isConfirming && (
              <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-3 mt-3">
                <p className="text-blue-400 text-sm">
                  📝 交易已发送: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </p>
              </div>
            )}

            {isTxSuccess && (
              <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 mt-3">
                <p className="text-green-400 text-sm">
                  ✅ 用户名已更新！交易哈希: {txHash?.slice(0, 10)}...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;


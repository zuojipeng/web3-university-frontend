import { useState, useEffect, useRef, useCallback } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  YD_TOKEN_ADDRESS,
  COURSE_PLATFORM_ADDRESS,
  COURSE_PURCHASE_ADDRESS,
  YD_TOKEN_ABI,
  COURSE_PLATFORM_ABI,
  COURSE_PURCHASE_ABI,
} from '../config';
import { CURRENT_CHAIN_ID } from '../lib/wagmi';

const STEP = {
  IDLE: 'idle',
  CHECKING: 'checking',
  NEED_APPROVE: 'needApprove',
  APPROVING: 'approving',
  PURCHASING: 'purchasing',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function PurchaseCourseModal({
  isOpen,
  onClose,
  course,
  onSuccess,
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [step, setStep] = useState(STEP.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const handledTxRef = useRef(null);
  const manualCheckRef = useRef(null); // 用于手动检查交易

  const { 
    writeContract: writeApprove, 
    writeContractAsync: writeApproveAsync,
    data: approveTxHash, 
    isPending: isApproving, 
    error: approveError 
  } = useWriteContract();
  
  const { 
    writeContract: writePurchase, 
    writeContractAsync: writePurchaseAsync,
    data: purchaseTxHash, 
    isPending: isPurchasing, 
    error: purchaseError 
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess, error: approveReceiptError } =
    useWaitForTransactionReceipt({ 
      hash: approveTxHash,
      query: {
        enabled: !!approveTxHash,
        retry: 3,
        retryDelay: 1000,
      },
    });
  const { isLoading: isPurchaseConfirming, isSuccess: isPurchaseSuccess, error: purchaseReceiptError } =
    useWaitForTransactionReceipt({ 
      hash: purchaseTxHash,
      query: {
        enabled: !!purchaseTxHash,
        retry: 3,
        retryDelay: 1000,
      },
    });

  // 检查授权额度（授权应该给 CoursePurchase 合约，不是 CourseManager）
  const { data: allowance, isLoading: isLoadingAllowance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: YD_TOKEN_ABI,
    functionName: 'allowance',
    args: address && course ? [address, COURSE_PURCHASE_ADDRESS] : undefined,
    query: {
      enabled: isOpen && !!address && !!course,
    },
  });

  // 检查余额
  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: YD_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isOpen && !!address,
    },
  });

  // 重置状态
  const resetState = () => {
    setStep(STEP.IDLE);
    setErrorMessage('');
    handledTxRef.current = null;
  };

  // 关闭模态框（需要在 useEffect 之前定义）
  const handleClose = useCallback((force) => {
    const busy =
      step === STEP.APPROVING ||
      step === STEP.PURCHASING ||
      isApproving ||
      isPurchasing ||
      isApproveConfirming ||
      isPurchaseConfirming;
    if (!force && busy) return;
    resetState();
    onClose?.();
  }, [step, isApproving, isPurchasing, isApproveConfirming, isPurchaseConfirming, onClose]);

  // 购买课程（需要在 useEffect 之前定义）
  const handlePurchase = useCallback(async () => {
    if (!course || !address) return;

    // 验证 courseId（注意：courseId 可以是 0，因为是从 0 开始的索引）
    // 只有 undefined、null、空字符串才是无效的
    if (course.id === undefined || course.id === null || course.id === '') {
      console.error('❌ 无效的课程 ID:', course.id);
      setStep(STEP.ERROR);
      setErrorMessage('无效的课程 ID，请刷新页面重试');
      return;
    }

    // ========== 检查并切换到 Sepolia ==========
    try {
      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdHex, 16);
      
      if (currentChainId !== 11155111) {
        setErrorMessage('正在切换到 Sepolia 网络...');
        
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          });
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (switchErr) {
          setStep(STEP.ERROR);
          setErrorMessage('❌ 切换到 Sepolia 失败，请手动切换');
          return;
        }
      }
    } catch (err) {
      setStep(STEP.ERROR);
      setErrorMessage('检查网络失败');
      return;
    }
    // ========== 检查结束 ==========

    try {
      setStep(STEP.PURCHASING);
      setErrorMessage('');

      // 确保 courseId 是 BigInt（0 也是有效的 courseId，因为合约从 0 开始计数）
      const courseId = BigInt(course.id);
      
      // console.log('📝 准备购买课程 - courseId:', courseId.toString(), 'course:', course);
      
      // 使用 writeContractAsync 获取交易哈希
      // purchaseCourse 函数在 CoursePurchase 合约中，不在 CourseManager 中
      const txHash = await writePurchaseAsync({
        address: COURSE_PURCHASE_ADDRESS,
        abi: COURSE_PURCHASE_ABI,
        functionName: 'purchaseCourse',
        args: [courseId],
        chainId: CURRENT_CHAIN_ID, // 使用当前配置的链 ID
      });

      // console.log('✅ 购买交易已发送，交易哈希:', txHash);
      // console.log('purchaseTxHash (from hook):', purchaseTxHash);
      
      // 保存交易哈希到本地状态（作为备用）
      setLocalPurchaseTxHash(txHash);
      
      // 注意：txHash 是函数返回值，purchaseTxHash 是 hook 的 data 字段
      // 两者应该相同，但为了确保，我们同时保存到本地状态
    } catch (err) {
      console.error('购买失败:', err);
      setStep(STEP.ERROR);
      if (err?.shortMessage?.includes('User rejected')) {
        setErrorMessage('用户拒绝了购买交易');
      } else {
        setErrorMessage(err?.shortMessage || err?.message || '购买失败，请重试');
      }
    }
  }, [course, address, writePurchaseAsync]);

  // 授权 YD 代币
  const handleApprove = async () => {
    if (!course || !address) return;

    // ========== 检查并切换到 Sepolia ==========
    try {
      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdHex, 16);
      
      if (currentChainId !== 11155111) {
        setStep(STEP.NEED_APPROVE);
        setErrorMessage('正在切换到 Sepolia 网络...');
        
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          });
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (switchErr) {
          setStep(STEP.ERROR);
          setErrorMessage('❌ 切换到 Sepolia 失败，请手动切换');
          return;
        }
      }
    } catch (err) {
      setStep(STEP.ERROR);
      setErrorMessage('检查网络失败');
      return;
    }
    // ========== 检查结束 ==========

    try {
      setStep(STEP.APPROVING);
      setErrorMessage('');

      const coursePrice = course.price || BigInt(0);
      // 授权应该给 CoursePurchase 合约，不是 CourseManager
      const txHash = await writeApproveAsync({
        address: YD_TOKEN_ADDRESS,
        abi: YD_TOKEN_ABI,
        functionName: 'approve',
        args: [COURSE_PURCHASE_ADDRESS, coursePrice],
        chainId: CURRENT_CHAIN_ID, // 使用当前配置的链 ID
      });
      
      // console.log('✅ 授权交易已发送，交易哈希:', txHash);
      // hash 会自动存储在 approveTxHash 中
    } catch (err) {
      console.error('授权失败:', err);
      setStep(STEP.ERROR);
      if (err?.shortMessage?.includes('User rejected')) {
        setErrorMessage('用户拒绝了授权交易');
      } else {
        setErrorMessage(err?.shortMessage || err?.message || '授权失败，请重试');
      }
    }
  };

  // 检查授权状态
  useEffect(() => {
    // 如果弹窗未打开或缺少必要信息，不处理
    if (!isOpen || !course || !address) {
      return;
    }

    // 如果还在加载中，显示检查状态
    if (isLoadingAllowance || isLoadingBalance) {
      setStep(STEP.CHECKING);
      return;
    }

    // 如果数据还未加载完成（undefined），继续等待
    if (allowance === undefined || balance === undefined) {
      setStep(STEP.CHECKING);
      return;
    }

    // 数据已加载，开始检查
    const coursePrice = course.price || BigInt(0);

    // 检查余额
    if (balance < coursePrice) {
      setStep(STEP.ERROR);
      setErrorMessage(
        `余额不足！当前余额: ${formatUnits(balance, 18)} YD，需要: ${formatUnits(coursePrice, 18)} YD`
      );
      return;
    }

    // 检查授权额度
    if (allowance < coursePrice) {
      setStep(STEP.NEED_APPROVE);
      } else {
      setStep(STEP.IDLE);
    }
  }, [isOpen, course, address, allowance, balance, isLoadingAllowance, isLoadingBalance]);

  // 监听授权交易确认
  useEffect(() => {
    if (!isApproveSuccess || !approveTxHash) return;
    if (handledTxRef.current === approveTxHash) return;
    handledTxRef.current = approveTxHash;
    setStep(STEP.IDLE);
    setTimeout(() => {
      handlePurchase();
    }, 1000);
  }, [isApproveSuccess, approveTxHash, handlePurchase]);

  // 手动检查交易状态（备用方案，用于本地 Hardhat 网络）
  const manuallyCheckTransaction = useCallback(async (txHash) => {
    if (!txHash) {
      console.error('❌ 手动检查：交易哈希为空');
      return;
    }

    // console.log('🔍 开始手动检查交易状态:', txHash);
    // console.log('publicClient:', publicClient);

    if (!publicClient) {
      console.error('❌ publicClient 未初始化');
      setStep(STEP.ERROR);
      setErrorMessage('无法检查交易状态，请刷新页面重试');
      return;
    }

    try {
      // console.log('⏳ 等待交易确认...');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60000, // 60秒超时
        confirmations: 1,
      });

      // console.log('📄 收到交易收据:', receipt);

      if (receipt && receipt.status === 'success') {
        // console.log('✅ 手动检查：交易确认成功!');
        if (handledTxRef.current === txHash) {
          // console.log('⚠️ 交易已处理过，跳过');
          return; // 已处理过
        }
        handledTxRef.current = txHash;
        setStep(STEP.SUCCESS);
        onSuccess?.();
        setTimeout(() => {
          handleClose(true);
        }, 2000);
      } else if (receipt && receipt.status === 'reverted') {
        console.error('❌ 手动检查：交易被回滚:', receipt);
        setStep(STEP.ERROR);
        setErrorMessage('交易被回滚，请重试');
      } else {
        console.warn('⚠️ 交易状态未知:', receipt);
      }
    } catch (err) {
      console.error('❌ 手动检查交易失败:', err);
      setStep(STEP.ERROR);
      setErrorMessage(`交易确认失败: ${err?.message || err?.toString() || '未知错误'}`);
    }
  }, [publicClient, onSuccess, handleClose]);

  // 使用本地状态存储交易哈希（作为备用）
  const [localPurchaseTxHash, setLocalPurchaseTxHash] = useState(null);
  
  // 监听购买交易确认
  useEffect(() => {
    // 优先使用 hook 的 purchaseTxHash，如果没有则使用本地存储的
    const txHash = purchaseTxHash || localPurchaseTxHash;
    if (!txHash) return; // 如果没有交易哈希，不处理
    
    // console.log('🔍 检查交易确认状态 - purchaseTxHash:', purchaseTxHash, 'localPurchaseTxHash:', localPurchaseTxHash);
    
    // 如果交易成功
    if (isPurchaseSuccess) {
      if (handledTxRef.current === txHash) return; // 已处理过
      handledTxRef.current = txHash;
      // console.log('✅ 购买交易确认成功:', txHash);
      setStep(STEP.SUCCESS);
      onSuccess?.();
      setTimeout(() => {
        handleClose(true);
      }, 2000);
      return;
    }

    // 如果交易确认出错
    if (purchaseReceiptError) {
      console.error('购买交易确认失败:', purchaseReceiptError);
      // 如果 useWaitForTransactionReceipt 失败，尝试手动检查
      if (!manualCheckRef.current && txHash) {
        // console.log('⚠️ useWaitForTransactionReceipt 失败，尝试手动检查...');
        manualCheckRef.current = true;
        manuallyCheckTransaction(txHash);
      }
      return;
    }

    // 如果交易发送失败
    if (purchaseError) {
      console.error('购买交易发送失败:', purchaseError);
      setStep(STEP.ERROR);
      if (purchaseError?.shortMessage?.includes('User rejected')) {
        setErrorMessage('用户拒绝了购买交易');
      } else {
        setErrorMessage(purchaseError?.shortMessage || purchaseError?.message || '购买失败，请重试');
      }
      return;
    }

    // 如果交易哈希存在，立即启动手动检查（作为备用）
    if (txHash && !isPurchaseSuccess && !handledTxRef.current) {
      // console.log('📝 检测到交易哈希，准备启动手动检查:', txHash);
      // console.log('当前状态 - isPurchaseSuccess:', isPurchaseSuccess, 'isPurchaseConfirming:', isPurchaseConfirming);
      
      // 延迟一下，给 useWaitForTransactionReceipt 一些时间
      const checkTimeout = setTimeout(() => {
        if (!isPurchaseSuccess && !handledTxRef.current && !manualCheckRef.current) {
          // console.log('🔍 启动手动交易检查（备用方案）...');
          // console.log('交易哈希:', txHash);
          manualCheckRef.current = true;
          manuallyCheckTransaction(txHash);
        } else {
          // console.log('⏭️ 跳过手动检查 - isPurchaseSuccess:', isPurchaseSuccess, 'handledTxRef:', handledTxRef.current, 'manualCheckRef:', manualCheckRef.current);
        }
      }, 2000); // 2秒后启动手动检查（缩短等待时间）

      return () => {
        // console.log('🧹 清理手动检查定时器');
        clearTimeout(checkTimeout);
      };
    }
  }, [isPurchaseSuccess, purchaseTxHash, localPurchaseTxHash, purchaseError, purchaseReceiptError, isPurchaseConfirming, onSuccess, handleClose, manuallyCheckTransaction]);

  // 清理手动检查标志和本地交易哈希
  useEffect(() => {
    if (!purchaseTxHash && !localPurchaseTxHash) {
      manualCheckRef.current = null;
      setLocalPurchaseTxHash(null);
    }
  }, [purchaseTxHash, localPurchaseTxHash]);
  
  // 重置时清理本地交易哈希
  useEffect(() => {
    if (!isOpen) {
      setLocalPurchaseTxHash(null);
    }
  }, [isOpen]);

  // 打开时重置状态
  useEffect(() => {
    if (isOpen) {
      resetState();
      // 重置后，状态检查的 useEffect 会自动处理后续状态
    }
  }, [isOpen]);

  if (!isOpen || !course) return null;

  // 调试：打印课程信息
  // console.log('📋 PurchaseCourseModal - course 对象:', course);
  // console.log('📋 course.id:', course.id, '类型:', typeof course.id);

  // 检查是否是自己的课程
  const isMyCourse = address && course?.author && 
    course.author.toLowerCase() === address.toLowerCase();

  // 如果是自己的课程，显示提示并返回
  if (isMyCourse) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 relative">
          <button
            onClick={() => onClose?.()}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-2xl font-bold text-purple-400 mb-6">提示</h2>

          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 mb-6">
            <p className="text-yellow-400 text-sm">
              ⚠️ 这是您创建的课程，无法购买自己的课程。
            </p>
          </div>

          <button
            onClick={() => onClose?.()}
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
          >
            知道了
          </button>
        </div>
      </div>
    );
  }

  const coursePrice = course.price || BigInt(0);
  const priceDisplay = formatUnits(coursePrice, 18);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 relative">
        {!(isApproving || isPurchasing || isApproveConfirming || isPurchaseConfirming) && (
          <button
            onClick={() => handleClose(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <h2 className="text-2xl font-bold text-purple-400 mb-6">购买课程</h2>

        {/* 课程信息 */}
        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <h3 className="text-white font-semibold mb-2">{course.name}</h3>
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">{course.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">价格</span>
            <span className="text-purple-400 font-bold text-xl">{priceDisplay} YD</span>
          </div>
        </div>

        {/* 购买步骤指示器 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === STEP.APPROVING ||
                  step === STEP.PURCHASING ||
                  step === STEP.SUCCESS ||
                  isApproveSuccess
                  ? 'bg-green-600'
                    : step === STEP.NEED_APPROVE
                  ? 'bg-yellow-600'
                  : 'bg-gray-600'
                }`}
              >
                {step === STEP.APPROVING || isApproving || isApproveConfirming ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (step === STEP.PURCHASING || step === STEP.SUCCESS || isApproveSuccess) ? (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-white font-semibold">1</span>
                )}
              </div>
              <div className="flex-1 h-1 bg-gray-600 mx-2"></div>
            </div>

            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === STEP.SUCCESS || isPurchaseSuccess
                  ? 'bg-green-600'
                    : step === STEP.PURCHASING || isPurchasing || isPurchaseConfirming
                  ? 'bg-blue-600'
                  : 'bg-gray-600'
                }`}
              >
                {step === STEP.PURCHASING || isPurchasing || isPurchaseConfirming ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : step === STEP.SUCCESS || isPurchaseSuccess ? (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-white font-semibold">2</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className={step === STEP.APPROVING || step === STEP.NEED_APPROVE ? 'text-purple-400' : 'text-gray-500'}>
              授权代币
            </span>
            <span className={step === STEP.PURCHASING ? 'text-blue-400' : 'text-gray-500'}>购买课程</span>
          </div>
        </div>

        {/* 状态信息 */}
        <div className="space-y-4">
          {step === STEP.CHECKING && (
            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <svg
                  className="animate-spin h-5 w-5 text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="text-blue-400 text-sm">正在检查授权状态...</p>
              </div>
            </div>
          )}

          {step === STEP.NEED_APPROVE && (
            <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
              <p className="text-yellow-400 text-sm mb-3">需要授权 {priceDisplay} YD 给购买合约</p>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="w-full bg-yellow-600 text-white py-3 rounded-lg hover:bg-yellow-700 transition font-semibold disabled:opacity-50"
              >
                授权代币
              </button>
            </div>
          )}

          {(step === STEP.APPROVING || isApproving || isApproveConfirming) && (
            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <svg
                  className="animate-spin h-5 w-5 text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <div>
                  <p className="text-blue-400 text-sm font-semibold">授权交易进行中...</p>
                  <p className="text-gray-500 text-xs mt-1">请在钱包中确认交易</p>
                </div>
              </div>
            </div>
          )}

          {(step === STEP.PURCHASING || isPurchasing || isPurchaseConfirming) && (
            <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <svg
                  className="animate-spin h-5 w-5 text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <div className="flex-1">
                  <p className="text-blue-400 text-sm font-semibold">
                    {isPurchasing ? '等待钱包确认...' : isPurchaseConfirming ? '交易确认中...' : '购买交易进行中...'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    {(purchaseTxHash || localPurchaseTxHash) ? (
                      <>交易哈希: <span className="font-mono">{(purchaseTxHash || localPurchaseTxHash).slice(0, 10)}...{(purchaseTxHash || localPurchaseTxHash).slice(-8)}</span></>
                    ) : (
                      '请等待交易确认'
                    )}
                  </p>
                  {purchaseReceiptError && (
                    <p className="text-red-400 text-xs mt-1">⚠️ 交易确认出错，请检查网络连接</p>
                  )}
                  {(purchaseTxHash || localPurchaseTxHash) && !isPurchaseSuccess && (
                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => {
                          const txHash = purchaseTxHash || localPurchaseTxHash;
                          // console.log('🔄 用户点击手动检查按钮');
                          // console.log('交易哈希:', txHash);
                          // console.log('purchaseTxHash (from hook):', purchaseTxHash);
                          // console.log('localPurchaseTxHash:', localPurchaseTxHash);
                          // console.log('publicClient:', publicClient);
                          // console.log('isPurchaseSuccess:', isPurchaseSuccess);
                          // console.log('isPurchaseConfirming:', isPurchaseConfirming);
                          manualCheckRef.current = false; // 重置标志，允许重新检查
                          manuallyCheckTransaction(txHash);
                        }}
                        disabled={isPurchaseConfirming}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded-lg text-sm font-semibold transition"
                      >
                        {isPurchaseConfirming ? '⏳ 自动检查中...' : '🔄 手动检查交易状态'}
                      </button>
                      <p className="text-gray-500 text-xs text-center">
                        如果自动确认失败，请点击上方按钮手动检查
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === STEP.SUCCESS && (
            <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="text-green-400 font-semibold">🎉 购买成功！</p>
                  <p className="text-gray-400 text-sm mt-1">你现在可以开始学习这门课程了</p>
                </div>
              </div>
            </div>
          )}

          {step === STEP.ERROR && errorMessage && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
              <p className="text-red-400 text-sm">{errorMessage}</p>
                <button
                onClick={() => {
                  setStep(STEP.CHECKING);
                  setErrorMessage('');
                }}
                  className="mt-3 w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition"
                >
                  重试
                </button>
            </div>
          )}

          {step === STEP.IDLE && !(isApproving || isPurchasing) && (
            <button
              onClick={handlePurchase}
              disabled={isPurchasing}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold disabled:opacity-50"
            >
              确认购买
            </button>
          )}
        </div>

        {/* 交易哈希 */}
        {(approveTxHash || purchaseTxHash || localPurchaseTxHash) && (
          <div className="mt-4 p-3 bg-gray-700 rounded-lg">
            <p className="text-gray-400 text-xs mb-1">交易哈希</p>
            <p className="text-gray-300 text-xs font-mono break-all">{approveTxHash || purchaseTxHash || localPurchaseTxHash}</p>
          </div>
        )}

        {/* 提示信息 */}
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500 rounded-lg">
          <p className="text-blue-400 text-sm">💡 购买过程需要两笔交易：授权代币 + 购买课程</p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { parseUnits, decodeEventLog } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { COURSE_PLATFORM_ADDRESS, COURSE_PLATFORM_ABI } from '../config';
import PinataUpload from './PinataUpload';

const STATUS = {
  IDLE: 'idle',
  SIGNING: 'signing',
  WAITING: 'waiting',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function CreateCourseModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({ name: '', description: '', price: '10' });
  const [contentHash, setContentHash] = useState('');
  const [thumbnailHash, setThumbnailHash] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState('');

  const { writeContract, writeContractAsync, data: txHash, isPending, error: writeError } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ 
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });
  const handledTxRef = useRef(null);

  // 从交易收据中解析课程 ID
  useEffect(() => {
    if (!isSuccess || !txHash || !receipt) return;
    if (handledTxRef.current === txHash) return;
    
    handledTxRef.current = txHash;
    
    try {
      // 方法1: 尝试从事件中解析 CourseCreated 事件
      let courseId = null;
      
      if (receipt.logs && receipt.logs.length > 0) {
        // 查找 CourseCreated 事件定义
        const courseCreatedEvent = COURSE_PLATFORM_ABI.find(
          item => item.type === 'event' && item.name === 'CourseCreated'
        );
        
        if (courseCreatedEvent) {
          // CourseCreated 事件的签名哈希（用于匹配）
          const eventSignature = courseCreatedEvent.name + '(' + 
            courseCreatedEvent.inputs.map(i => i.type).join(',') + ')';
          
          for (const log of receipt.logs) {
            // 检查是否是 CourseCreated 事件（通过 topics[0] 匹配事件签名）
            try {
              const decoded = decodeEventLog({
                abi: [courseCreatedEvent],
                data: log.data,
                topics: log.topics,
              });
              
              if (decoded.eventName === 'CourseCreated') {
                // courseId 是 indexed 参数，在 topics[1] 中（topics[0] 是事件签名）
                // 也可以从 decoded.args 中获取
                courseId = decoded.args.courseId || decoded.args[0];
                console.log('✅ 从 CourseCreated 事件中解析到课程 ID:', courseId);
                console.log('   事件参数:', decoded.args);
                break;
              }
            } catch (err) {
              // 不是这个事件，继续查找
              continue;
            }
          }
        } else {
          console.warn('⚠️ 未找到 CourseCreated 事件定义');
        }
      }
      
      // 方法2: 如果事件解析失败，尝试从交易返回值中获取
      // 注意：对于 view 函数可以使用 simulateContract，但对于 write 函数，返回值在链上不可直接获取
      // 所以主要依赖事件
      
      if (courseId !== null && courseId !== undefined) {
        console.log('✅ 课程创建成功，课程 ID:', courseId);
      } else {
        console.warn('⚠️ 无法从交易收据中解析课程 ID，但交易已成功');
      }
      
      setStatus(STATUS.SUCCESS);
      onSuccess?.();
      setTimeout(() => {
        handleClose(true);
      }, 1500);
    } catch (err) {
      console.error('解析交易收据失败:', err);
      // 即使解析失败，交易也成功了，继续执行
      setStatus(STATUS.SUCCESS);
      onSuccess?.();
      setTimeout(() => {
        handleClose(true);
      }, 1500);
    }
  }, [isSuccess, txHash, receipt, onSuccess]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setErrorMessage('课程名称不能为空');
      return false;
    }
    if (!formData.description.trim()) {
      setErrorMessage('课程描述不能为空');
      return false;
    }
    if (parseFloat(formData.price) <= 0) {
      setErrorMessage('课程价格必须大于 0');
      return false;
    }
    if (!contentHash || contentHash.trim() === '') {
      setErrorMessage('请先上传课程内容文件：选择文件后点击"上传到 IPFS"按钮');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    // ========== 1. 检查并切换到 Sepolia ==========
    try {
      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdHex, 16);
      
      console.log('🔍 当前钱包链 ID:', currentChainId);
      
      if (currentChainId !== 11155111) {
        console.log('⚠️ 当前链不是 Sepolia，尝试切换...');
        setStatus(STATUS.SIGNING);
        setErrorMessage('正在切换到 Sepolia 网络，请在钱包中确认...');
        
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia
          });
          console.log('✅ 已切换到 Sepolia');
          // 等待一下让钱包状态同步
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (switchErr) {
          console.error('切换网络失败:', switchErr);
          setStatus(STATUS.ERROR);
          setErrorMessage('❌ 切换到 Sepolia 失败，请手动在钱包中切换到 Sepolia 测试网');
          return;
        }
      }
    } catch (err) {
      console.error('检查网络失败:', err);
      setStatus(STATUS.ERROR);
      setErrorMessage('无法检查当前网络，请确保钱包已连接');
      return;
    }
    // ========== 检查结束 ==========

    setStatus(STATUS.SIGNING);
    setErrorMessage('');

    try {
      const priceInWei = parseUnits(formData.price, 18);
      
      // 使用 writeContractAsync 获取交易哈希
      const hash = await writeContractAsync({
        address: COURSE_PLATFORM_ADDRESS,
        abi: COURSE_PLATFORM_ABI,
        functionName: 'createCourse',
        args: [
          formData.name,
          formData.description,
          priceInWei,
          contentHash, // IPFS content hash
          thumbnailHash || '' // thumbnailHash (可选)
        ],
        chainId: 11155111, // 明确指定 Sepolia 链 ID
      });
      
      console.log('✅ 创建课程交易已发送，交易哈希:', hash);
      setStatus(STATUS.WAITING);
    } catch (err) {
      console.error('创建课程失败:', err);
      setStatus(STATUS.ERROR);
      if (err?.shortMessage?.includes('User rejected')) {
        setErrorMessage('用户拒绝了交易');
      } else {
        setErrorMessage(err?.shortMessage || err?.message || '创建课程失败，请重试');
      }
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', price: '10' });
    setContentHash('');
    setThumbnailHash('');
    setStatus(STATUS.IDLE);
    setErrorMessage('');
    handledTxRef.current = null;
  };

  const handleContentUploadSuccess = (result) => {
    console.log('收到上传成功回调，result:', result);
    const hash = result?.ipfsHash || result?.hash || result;
    if (hash) {
      setContentHash(hash);
      console.log('课程内容文件上传成功，IPFS Hash:', hash);
    } else {
      console.error('上传成功但未收到 IPFS Hash:', result);
      setErrorMessage('上传成功但未收到 IPFS Hash，请重试');
    }
  };

  const handleThumbnailUploadSuccess = (result) => {
    setThumbnailHash(result.ipfsHash);
    console.log('封面图上传成功，IPFS Hash:', result.ipfsHash);
  };

  const handleClose = (force) => {
    const busy = status === STATUS.SIGNING || status === STATUS.WAITING;
    if (!force && busy) return; // 进行中的交易不允许关闭
    resetForm();
    onClose?.();
  };

  if (!isOpen) return null;

  const isProcessing = isPending || isConfirming || status === STATUS.WAITING;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] flex flex-col p-6 relative">
        {!isProcessing && (
          <button
            onClick={() => handleClose(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <h2 className="text-2xl font-bold text-purple-300 mb-6 flex-shrink-0">创建新课程</h2>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-gray-300 mb-2">课程名称 *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="例如：Solidity 智能合约开发基础"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isProcessing}
              maxLength={100}
            />
            <p className="text-gray-500 text-sm mt-1">{formData.name.length}/100</p>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">课程描述 *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="描述你的课程内容、学习目标等..."
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              rows={4}
              disabled={isProcessing}
              maxLength={500}
            />
            <p className="text-gray-500 text-sm mt-1">{formData.description.length}/500</p>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">课程价格 (YD) *</label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              placeholder="10"
              min="0.01"
              step="0.01"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isProcessing}
            />
            <p className="text-gray-500 text-sm mt-1">
              学生需要支付 {formData.price} YD 才能购买此课程
            </p>
          </div>

          {/* 课程内容文件上传 */}
          <div>
            <label className="block text-gray-300 mb-2">课程内容文件 *</label>
            <PinataUpload
              onUploadSuccess={handleContentUploadSuccess}
              accept="*"
              enableCompression={true}
            />
            {contentHash ? (
              <p className="text-green-400 text-sm mt-2">
                ✅ 文件已上传: {contentHash.slice(0, 10)}...{contentHash.slice(-8)}
              </p>
            ) : (
              <p className="text-yellow-400 text-sm mt-2">
                ⚠️ 请先选择文件并点击"上传到 IPFS"按钮
              </p>
            )}
          </div>

          {/* 封面图上传（可选） */}
          <div>
            <label className="block text-gray-300 mb-2">
              课程封面图 <span className="text-gray-500 text-sm">(可选)</span>
            </label>
            <PinataUpload
              onUploadSuccess={handleThumbnailUploadSuccess}
              accept="image/*"
              enableCompression={true}
            />
            {thumbnailHash && (
              <p className="text-green-400 text-sm mt-2">
                ✅ 封面图已上传: {thumbnailHash.slice(0, 10)}...{thumbnailHash.slice(-8)}
              </p>
            )}
          </div>

          {errorMessage && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          {(status === STATUS.SIGNING || status === STATUS.WAITING || status === STATUS.SUCCESS || status === STATUS.ERROR || writeError) && (
            <div
              className={`rounded-lg p-3 mt-2 ${
                status === STATUS.SUCCESS
                  ? 'bg-green-900/20 border border-green-500'
                  : status === STATUS.ERROR || writeError
                  ? 'bg-red-900/20 border border-red-500'
                  : 'bg-blue-900/20 border border-blue-500'
              }`}
            >
              <p
                className={`text-sm ${
                  status === STATUS.SUCCESS
                    ? 'text-green-400'
                    : status === STATUS.ERROR || writeError
                    ? 'text-red-400'
                    : 'text-blue-400'
                }`}
              >
                {status === STATUS.SIGNING && '请在钱包中确认交易...'}
                {status === STATUS.WAITING && '等待交易确认...'}
                {status === STATUS.SUCCESS && '✅ 课程创建成功！'}
                {(status === STATUS.ERROR || writeError) && '交易失败，请重试'}
              </p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={() => handleClose(false)}
              disabled={isProcessing}
              className="flex-1 bg-gray-700 text-white rounded-lg py-3 hover:bg-gray-600 transition disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isProcessing || !contentHash}
              className="flex-1 bg-purple-600 text-white rounded-lg py-3 hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {status === STATUS.SIGNING && '请确认...'}
              {status === STATUS.WAITING && '确认中...'}
              {status === STATUS.SUCCESS && '已创建'}
              {[STATUS.IDLE, STATUS.ERROR].includes(status) && !isProcessing && '创建课程'}
            </button>
          </div>
        </form>

        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500 rounded-lg text-blue-300 text-sm flex-shrink-0">
          💡 创建课程需要支付少量 Gas 费用
        </div>
      </div>
    </div>
  );
}

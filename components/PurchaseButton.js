import { useAccount, useReadContract } from 'wagmi';
import { COURSE_PURCHASE_ADDRESS, COURSE_PURCHASE_ABI } from '../config';

export default function PurchaseButton({ course, onPurchaseClick }) {
  const { address, isConnected } = useAccount();

  // 检查是否是自己的课程
  const isMyCourse = address && course?.author && 
    course.author.toLowerCase() === address.toLowerCase();

  // 检查是否已购买（hasPurchased 函数在 CoursePurchase 合约中）
  const { data: hasPurchased } = useReadContract({
    address: COURSE_PURCHASE_ADDRESS,
    abi: COURSE_PURCHASE_ABI,
    functionName: 'hasPurchased',
    args: address && course ? [address, BigInt(course.id || 0)] : undefined,
    query: {
      enabled: !!address && !!course && !isMyCourse, // 如果是自己的课程，不需要检查购买状态
    },
  });

  const handleClick = (e) => {
    e.stopPropagation(); // 防止触发卡片点击
    if (!isConnected) {
      alert("请先连接钱包");
      return;
    }
    if (onPurchaseClick) {
      onPurchaseClick(course);
    }
  };

  // 如果是自己的课程，不显示购买按钮
  if (isMyCourse) {
    return (
      <button 
        disabled 
        className="px-4 py-2 bg-gray-600 text-gray-400 font-bold rounded-lg cursor-default"
        title="这是您创建的课程"
      >
        我的课程
      </button>
    );
  }

  if (hasPurchased) {
    return (
      <button 
        disabled 
        className="px-4 py-2 bg-gray-600 text-green-400 font-bold rounded-lg cursor-default flex items-center gap-2"
      >
        ✅ 已购买
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all hover:scale-105"
    >
      购买课程
    </button>
  );
}


import { useCourses } from '../hooks/useCourses';
import { useAccount, useReadContracts } from 'wagmi';
import PurchaseButton from './PurchaseButton';
import { COURSE_PURCHASE_ADDRESS, COURSE_PURCHASE_ABI } from '../config';

/**
 * 课程列表组件（花哨版 UI）
 * - 使用 useCourses 从链上读取课程
 * - 使用 PurchaseButton 完成购买流程
 * - 显示"我的课程""已购买"等标签
 * - 支持查看课程内容（仅限已购买或创建者）
 */
export default function CourseList({ onSelectCourse, onPurchaseClick, onViewContent }) {
  const { courses, isLoading, isError } = useCourses();
  const { address } = useAccount();

  const isOwnCourse = (instructor) => {
    if (!address) return false;
    return instructor?.toLowerCase() === address.toLowerCase();
  };

  // 批量检查所有课程的购买状态（hasPurchased 函数在 CoursePurchase 合约中）
  const purchaseCheckContracts = courses?.map((course) => ({
    address: COURSE_PURCHASE_ADDRESS,
    abi: COURSE_PURCHASE_ABI,
    functionName: 'hasPurchased',
    args: address && course.id ? [address, BigInt(course.id)] : undefined,
  })) || [];

  const { data: purchaseStatuses } = useReadContracts({
    contracts: purchaseCheckContracts,
    query: {
      enabled: !!address && courses && courses.length > 0,
    },
  });

  // 创建课程ID到购买状态的映射
  const purchaseStatusMap = {};
  if (purchaseStatuses && courses) {
    courses.forEach((course, index) => {
      if (purchaseStatuses[index]?.status === 'success') {
        purchaseStatusMap[course.id] = purchaseStatuses[index].result;
      }
    });
  }

  // 检查用户是否有权限查看课程内容
  const canViewContent = (course) => {
    if (!address) return false;
    // 如果是创建者，可以查看
    if (isOwnCourse(course.author)) return true;
    // 如果已购买，可以查看
    return purchaseStatusMap[course.id] === true;
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
        <p className="text-gray-400 mt-4">加载课程中...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 max-w-md mx-auto">
          <p className="text-red-400">加载课程失败，请检查网络连接或合约配置。</p>
        </div>
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-300">暂无课程</h3>
        <p className="mt-2 text-gray-500">还没有教育者创建课程</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
      {courses.map((course) => (
        <div
          key={course.id}
          className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-purple-500/20 transition-shadow duration-300 cursor-pointer"
          onClick={() => onSelectCourse?.(course)}
        >
          <div className="p-6 flex flex-col h-full">
            {/* 标签行 */}
            <div className="flex items-center space-x-2 mb-3">
              {isOwnCourse(course.author) && (
                <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                  我的课程
                </span>
              )}
              {/* 已购买标签交给 PurchaseButton 内部状态控制，这里只预留位置 */}
            </div>

            {/* 课程名称 */}
            <h3 className="text-xl font-bold text-white mb-3 line-clamp-2 min-h-[3.5rem]">
              {course.name}
            </h3>

            {/* 课程描述 */}
            <p className="text-gray-400 text-sm mb-4 line-clamp-3 min-h-[4.5rem]">
              {course.description}
            </p>

            {/* 课程信息 */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">价格</span>
                <span className="text-purple-400 font-bold text-lg">
                  {course.priceDisplay} YD
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">学生数</span>
                <span className="text-gray-300">
                  {course.studentCount} 人
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">讲师</span>
                <span className="text-gray-300 font-mono text-xs">
                  {course.author.slice(0, 6)}...{course.author.slice(-4)}
                </span>
              </div>
            </div>

            {/* 底部操作区：操作按钮 */}
            <div className="pt-4 border-t border-gray-700 mt-auto flex flex-col gap-2">
              {/* 查看内容按钮（仅限已购买或创建者） */}
              {course.contentHash && canViewContent(course) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onViewContent) {
                      onViewContent(course);
                    }
                  }}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-semibold text-sm"
                >
                  📚 查看课程内容
                </button>
              )}
              {/* 购买按钮 */}
              <PurchaseButton course={course} onPurchaseClick={onPurchaseClick} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

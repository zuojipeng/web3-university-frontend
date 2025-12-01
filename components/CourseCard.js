import { useAccount } from 'wagmi';
import PurchaseButton from './PurchaseButton';

export default function CourseCard({ course, onClick, onPurchaseClick }) {
  const { address } = useAccount();
  const isMyCourse = address && course.author.toLowerCase() === address.toLowerCase();

  return (
    <div 
      className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 hover:border-blue-500 transition-all hover:shadow-2xl relative overflow-hidden group flex flex-col justify-between"
      onClick={() => onClick && onClick(course)}
    >
      {isMyCourse && (
        <div className="absolute top-0 right-0 bg-blue-600 text-xs font-bold px-3 py-1 rounded-bl-lg z-10 text-white shadow-sm">
          我的课程
        </div>
      )}
      
      <div className="mb-4">
        <h3 className="text-xl font-bold text-white mb-2 line-clamp-1 group-hover:text-blue-400 transition-colors cursor-pointer">
          {course.name}
        </h3>
        <p className="text-gray-400 text-sm line-clamp-2 h-10">
          {course.description}
        </p>
      </div>

      <div className="flex justify-between items-end border-t border-gray-700 pt-4 mt-auto">
        <div>
          <p className="text-xs text-gray-500 mb-1">讲师</p>
          <p className="text-sm text-gray-300 font-mono">
            {course.author.slice(0, 6)}...{course.author.slice(-4)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {course.studentCount} 名学生
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
            <p className="text-2xl font-bold text-blue-400">
                {course.priceDisplay} <span className="text-sm text-gray-500">YD</span>
            </p>
            {/* 集成购买按钮 */}
            <PurchaseButton course={course} onPurchaseClick={onPurchaseClick} />
        </div>
      </div>
    </div>
  );
}

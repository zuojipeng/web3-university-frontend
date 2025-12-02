import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { COURSE_PLATFORM_ADDRESS, COURSE_PLATFORM_ABI } from '../config';

export function useCourses() {
  // 1. 获取所有 ID
  const { data: courseIds, isLoading: isLoadingIds, isError: isErrorIds } = useReadContract({
    address: COURSE_PLATFORM_ADDRESS,
    abi: COURSE_PLATFORM_ABI,
    functionName: 'getAllCourseIds',
  });

  // 2. 准备 getCourse 调用配置
  const contracts = courseIds?.map((id) => {
    // 确保 id 是 BigInt
    const courseId = typeof id === 'bigint' ? id : BigInt(id || 0);
    return {
      address: COURSE_PLATFORM_ADDRESS,
      abi: COURSE_PLATFORM_ABI,
      functionName: 'getCourse',
      args: [courseId],
    };
  }) || [];

  // 3. 批量获取课程详情
  const { data: coursesData, isLoading: isLoadingDetails, isError: isErrorDetails } = useReadContracts({
    contracts,
    query: {
      enabled: !!courseIds && courseIds.length > 0,
    }
  });

  // 4. 格式化数据
  const courses = coursesData?.map((result, index) => {
    if (result.status === 'success') {
      const course = result.result;
      if (!course) return null;

      // 根据合约 struct Course 的字段顺序：
      // 0: courseId, 1: name, 2: description, 3: price, 4: instructor, 
      // 5: isActive, 6: createdAt, 7: totalStudents, 8: contentHash, 9: thumbnailHash
      const idValue = course.courseId ?? course.id ?? course[0];
      const nameValue = course.name ?? course[1];
      const descriptionValue = course.description ?? course[2];
      const priceValue = course.price ?? course[3];
      const authorValue = course.instructor ?? course.author ?? course[4];
      const studentCountValue = course.totalStudents ?? course.studentCount ?? course[7];
      const contentHashValue = course.contentHash ?? course[8] ?? '';
      const thumbnailHashValue = course.thumbnailHash ?? course[9] ?? '';

      // 确保 id 是有效的
      // 优先使用 courseIds 数组中的对应值（这是最可靠的，因为索引是对应的）
      // 如果 courseIds 中没有，再尝试从 course 对象中获取
      let finalId = '';
      
      // 优先使用 courseIds[index]，因为这是最可靠的来源
      if (courseIds && courseIds[index] !== undefined && courseIds[index] !== null) {
        const idFromArray = courseIds[index];
        finalId = typeof idFromArray === 'bigint' ? idFromArray.toString() : String(idFromArray);
        // console.log(`✅ 课程 ${index}: 使用 courseIds[${index}] = ${finalId}`);
      } else if (idValue !== undefined && idValue !== null) {
        // 如果 courseIds 中没有，尝试从 course 对象中获取（即使可能是 0）
        finalId = typeof idValue === 'bigint' ? idValue.toString() : String(idValue);
        // console.log(`⚠️ 课程 ${index}: courseIds 中没有，使用 course.courseId = ${finalId}`);
      } else {
        // 如果都没有，记录警告但不跳过（让用户能看到课程，即使 ID 可能有问题）
        console.warn('⚠️ 无法获取课程 ID，使用索引作为备用:', { idValue, courseIdsIndex: courseIds?.[index], course, index });
        finalId = String(index + 1);
      }

      return {
        id: finalId,
        name: nameValue ?? '',
        description: descriptionValue ?? '',
        price: priceValue ?? 0n,
        priceDisplay: priceValue ? formatUnits(priceValue, 18) : '0',
        author: authorValue ?? '',
        studentCount: studentCountValue?.toString?.() ?? '0',
        contentHash: contentHashValue ?? '',
        thumbnailHash: thumbnailHashValue ?? '',
      };
    }
    return null;
  }).filter(Boolean) || [];

  return {
    courses,
    isLoading: isLoadingIds || isLoadingDetails,
    isError: isErrorIds || isErrorDetails,
  };
}


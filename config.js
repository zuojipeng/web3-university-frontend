// 从 frontend-config.json 导入合约配置
import contractConfig from './api/frontend-config.json';

// 兼容防护：避免 contracts 未定义时报错
const contracts = (contractConfig && contractConfig.contracts) || {};

// 合约地址（如果读取失败会是空字符串，方便后续排查）
export const YD_TOKEN_ADDRESS = contracts.YDToken?.address || '';
export const COURSE_MANAGER_ADDRESS = contracts.CourseManager?.address || '';
// CoursePlatform 使用 CourseManager（前端沿用旧命名）
export const COURSE_PLATFORM_ADDRESS = contracts.CourseManager?.address || '';
export const COURSE_PURCHASE_ADDRESS = contracts.CoursePurchase?.address || '';
export const YD_FAUCET_ADDRESS = contracts.YDFaucet?.address || '';
export const YD_STAKING_ADDRESS = contracts.YDStakingSafe?.address || '';
export const USER_PROFILE_ADDRESS = contracts.UserProfile?.address || '';
export const INSTRUCTOR_YIELD_ADDRESS = contracts.InstructorYieldManager?.address || '';

// 合约 ABI
export const YD_TOKEN_ABI = contracts.YDToken?.abi || [];
export const COURSE_MANAGER_ABI = contracts.CourseManager?.abi || [];
// CoursePlatform ABI 使用 CourseManager ABI
export const COURSE_PLATFORM_ABI = contracts.CourseManager?.abi || [];
export const COURSE_PURCHASE_ABI = contracts.CoursePurchase?.abi || [];
export const YD_FAUCET_ABI = contracts.YDFaucet?.abi || [];
export const YD_STAKING_ABI = contracts.YDStakingSafe?.abi || [];
export const USER_PROFILE_ABI = contracts.UserProfile?.abi || [];
export const INSTRUCTOR_YIELD_ABI = contracts.InstructorYieldManager?.abi || [];

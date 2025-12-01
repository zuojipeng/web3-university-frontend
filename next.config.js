/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages 部署配置
  output: 'export',  // 启用静态导出
  images: {
    unoptimized: true, // Cloudflare Pages 不支持 Next.js Image Optimization
  },
  
  // Webpack 配置：忽略 React Native 相关的可选依赖
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 浏览器端构建时忽略这些 React Native 模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'react-native': false,
      };
    }
    
    // 忽略特定的警告
    config.ignoreWarnings = [
      { module: /@metamask\/sdk/ },
    ];
    
    return config;
  },
  
  // 将 VITE_ 前缀的环境变量映射为 NEXT_PUBLIC_ 前缀，以便在客户端访问
  env: {
    // 如果使用 VITE_ 前缀，Next.js 需要显式暴露这些变量
    // 注意：Next.js 只会在构建时读取这些变量，所以需要重启开发服务器
    NEXT_PUBLIC_PINATA_JWT: process.env.VITE_PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT,
    NEXT_PUBLIC_PINATA_API_KEY: process.env.VITE_PINATA_API_KEY || process.env.NEXT_PUBLIC_PINATA_API_KEY,
    NEXT_PUBLIC_PINATA_SECRET_KEY: process.env.VITE_PINATA_SECRET_KEY || process.env.NEXT_PUBLIC_PINATA_SECRET_KEY,
    NEXT_PUBLIC_IPFS_GATEWAY: process.env.VITE_IPFS_GATEWAY || process.env.NEXT_PUBLIC_IPFS_GATEWAY,
  },
};

module.exports = nextConfig;


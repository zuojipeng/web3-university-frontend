import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { metaMask } from '@wagmi/connectors';

// 定义 Hardhat 本地链
const hardhatLocal = {
  id: 31337,
  name: 'Hardhat Local',
  network: 'hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
  blockExplorers: {
    default: { name: 'Hardhat', url: 'http://localhost:8545' },
  },
  testnet: true,
};

// 根据环境变量选择网络
const USE_LOCAL = process.env.NEXT_PUBLIC_USE_LOCAL_CHAIN === 'true';

// 选择链和传输配置
const chains = USE_LOCAL ? [hardhatLocal] : [sepolia];
const transports = USE_LOCAL
  ? { [hardhatLocal.id]: http('http://127.0.0.1:8545') }
  : { [sepolia.id]: http() };

// console.log('🔗 当前使用的区块链网络:', USE_LOCAL ? 'Hardhat 本地链 (31337)' : 'Sepolia 测试网 (11155111)');

export const wagmiConfig = createConfig({
  chains,
  connectors: [metaMask()],
  transports,
  batch: { multicall: false },
  ssr: false,
});

// 导出当前链 ID，方便其他地方使用
export const CURRENT_CHAIN_ID = USE_LOCAL ? 31337 : 11155111;
export const IS_LOCAL_CHAIN = USE_LOCAL;


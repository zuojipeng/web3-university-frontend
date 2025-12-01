import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { metaMask } from '@wagmi/connectors';

export const wagmiConfig = createConfig({
  // 只使用 Sepolia 测试网
  chains: [sepolia],
  // 强制使用 MetaMask 作为注入钱包，避免被 Rabby 等钱包“抢占”
  connectors: [metaMask()],
  transports: {
    [sepolia.id]: http(),
  },
  batch: { multicall: false },
  ssr: false,
});


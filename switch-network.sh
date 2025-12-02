#!/bin/bash

# 网络切换脚本
# 用法: ./switch-network.sh [local|sepolia]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示当前配置
show_current_config() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🔍 当前网络配置${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    if [ -f .env.local ]; then
        if grep -q "NEXT_PUBLIC_USE_LOCAL_CHAIN=true" .env.local; then
            echo -e "${GREEN}✅ Hardhat 本地链 (Chain ID: 31337)${NC}"
        else
            echo -e "${GREEN}✅ Sepolia 测试网 (Chain ID: 11155111)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  未找到 .env.local 文件${NC}"
    fi
    echo ""
}

# 切换到本地链
switch_to_local() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🔄 正在切换到 Hardhat 本地链...${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # 创建或更新 .env.local
    if [ -f .env.local ]; then
        # 如果文件存在，更新 NEXT_PUBLIC_USE_LOCAL_CHAIN
        if grep -q "NEXT_PUBLIC_USE_LOCAL_CHAIN" .env.local; then
            # macOS 兼容的 sed 命令
            sed -i '' 's/NEXT_PUBLIC_USE_LOCAL_CHAIN=.*/NEXT_PUBLIC_USE_LOCAL_CHAIN=true/' .env.local
        else
            # 如果没有这一行，添加它
            echo "NEXT_PUBLIC_USE_LOCAL_CHAIN=true" >> .env.local
        fi
    else
        # 如果文件不存在，创建它
        echo "NEXT_PUBLIC_USE_LOCAL_CHAIN=true" > .env.local
    fi
    
    echo -e "${GREEN}✅ 已切换到 Hardhat 本地链 (Chain ID: 31337)${NC}"
    echo ""
    echo -e "${YELLOW}📋 后续步骤:${NC}"
    echo -e "   1. 确保 Hardhat 节点正在运行: ${BLUE}npx hardhat node${NC}"
    echo -e "   2. 部署合约到本地链: ${BLUE}npx hardhat run scripts/deploy.js --network localhost${NC}"
    echo -e "   3. 更新 ${BLUE}api/frontend-config.json${NC} 中的合约地址"
    echo -e "   4. 重启开发服务器: ${BLUE}npm run dev${NC}"
    echo ""
}

# 切换到 Sepolia
switch_to_sepolia() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🔄 正在切换到 Sepolia 测试网...${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # 创建或更新 .env.local
    if [ -f .env.local ]; then
        if grep -q "NEXT_PUBLIC_USE_LOCAL_CHAIN" .env.local; then
            sed -i '' 's/NEXT_PUBLIC_USE_LOCAL_CHAIN=.*/NEXT_PUBLIC_USE_LOCAL_CHAIN=false/' .env.local
        else
            echo "NEXT_PUBLIC_USE_LOCAL_CHAIN=false" >> .env.local
        fi
    else
        echo "NEXT_PUBLIC_USE_LOCAL_CHAIN=false" > .env.local
    fi
    
    echo -e "${GREEN}✅ 已切换到 Sepolia 测试网 (Chain ID: 11155111)${NC}"
    echo ""
    echo -e "${YELLOW}📋 后续步骤:${NC}"
    echo -e "   1. 确保合约已部署到 Sepolia: ${BLUE}npx hardhat run scripts/deploy.js --network sepolia${NC}"
    echo -e "   2. 更新 ${BLUE}api/frontend-config.json${NC} 中的合约地址"
    echo -e "   3. 在 MetaMask 中切换到 Sepolia 网络"
    echo -e "   4. 重启开发服务器: ${BLUE}npm run dev${NC}"
    echo ""
}

# 显示帮助信息
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🔄 网络切换脚本${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "用法: ${GREEN}./switch-network.sh [local|sepolia]${NC}"
    echo ""
    echo -e "选项:"
    echo -e "  ${GREEN}local${NC}      - 切换到 Hardhat 本地链 (Chain ID: 31337)"
    echo -e "  ${GREEN}sepolia${NC}    - 切换到 Sepolia 测试网 (Chain ID: 11155111)"
    echo -e "  ${GREEN}status${NC}     - 显示当前网络配置"
    echo ""
    echo -e "示例:"
    echo -e "  ${BLUE}./switch-network.sh local${NC}     # 切换到本地链"
    echo -e "  ${BLUE}./switch-network.sh sepolia${NC}   # 切换到 Sepolia"
    echo -e "  ${BLUE}./switch-network.sh status${NC}    # 查看当前配置"
    echo ""
}

# 主逻辑
case "$1" in
    local)
        switch_to_local
        ;;
    sepolia)
        switch_to_sepolia
        ;;
    status)
        show_current_config
        ;;
    -h|--help|"")
        show_help
        ;;
    *)
        echo -e "${RED}❌ 错误: 未知选项 '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

echo -e "${BLUE}========================================${NC}"


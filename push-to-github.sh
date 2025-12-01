#!/bin/bash

echo "🔍 推送前安全检查..."

# 检查 .env 是否被忽略
if git check-ignore .env > /dev/null 2>&1; then
    echo "✅ .env 文件已被 .gitignore 保护"
else
    echo "⚠️  警告：.env 文件可能会被提交！"
    echo "请确保 .gitignore 包含 .env"
    exit 1
fi

echo ""
echo "📋 即将提交的文件列表："
git status --short

echo ""
read -p "确认要推送到 GitHub 吗？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消推送"
    exit 0
fi

echo ""
echo "🚀 开始推送..."

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: Web3 University frontend with Sepolia support"

# 推送（你需要先设置 remote origin）
echo ""
echo "⚠️  请先运行以下命令设置 GitHub 远程仓库："
echo "git remote add origin https://github.com/你的用户名/仓库名.git"
echo ""
echo "然后运行："
echo "git push -u origin main"

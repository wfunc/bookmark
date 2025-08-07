#!/bin/bash

# ====================
# BookMark 快速部署脚本
# ====================

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置 (请根据需要修改)
REGISTRY_URL="${REGISTRY_URL:-your-registry.com}"
NAMESPACE="${NAMESPACE:-your-namespace}"
IMAGE_NAME="bookmark"

echo -e "${BLUE}🚀 BookMark 快速部署脚本${NC}"
echo "=================================="

# 检查配置
if [ "$REGISTRY_URL" = "your-registry.com" ]; then
    echo -e "${YELLOW}⚠️  请设置环境变量:${NC}"
    echo "export REGISTRY_URL=your-registry.com"
    echo "export NAMESPACE=your-namespace"
    echo ""
    echo -e "${YELLOW}或者直接运行:${NC}"
    echo "REGISTRY_URL=registry.example.com NAMESPACE=myapp ./quick_deploy.sh"
    exit 1
fi

echo -e "${BLUE}📋 配置信息:${NC}"
echo "Registry: $REGISTRY_URL"
echo "Namespace: $NAMESPACE"
echo "Image: $IMAGE_NAME"
echo ""

# 获取版本号
VERSION="v$(date +%Y%m%d)-$(git rev-parse --short HEAD 2>/dev/null || echo 'local')"
echo -e "${BLUE}🏷️  版本: $VERSION${NC}"
echo ""

# 构建镜像
echo -e "${YELLOW}🔨 构建Docker镜像...${NC}"
docker build -t $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION .
docker tag $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:latest

# 推送镜像
echo -e "${YELLOW}📤 推送镜像到私有仓库...${NC}"
docker push $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION
docker push $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:latest

# 生成docker-compose文件
echo -e "${YELLOW}📝 生成部署配置...${NC}"
cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  bookmark:
    image: $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION
    container_name: bookmark-app
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - bookmark_data:/app/data
    environment:
      - PORT=8080
      - GIN_MODE=release
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  bookmark_data:
    driver: local
EOF

echo -e "${GREEN}✅ 部署成功!${NC}"
echo ""
echo -e "${BLUE}🎯 下一步操作:${NC}"
echo "1. 在目标服务器上运行:"
echo "   docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "2. 或者使用 kubectl (K8s):"
echo "   kubectl create deployment bookmark --image=$REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION"
echo "   kubectl expose deployment bookmark --port=80 --target-port=8080"
echo ""
echo -e "${BLUE}📊 镜像信息:${NC}"
echo "Registry: $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION"
echo "Latest: $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:latest"
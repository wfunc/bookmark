#!/bin/bash

# ====================
# BookMark Docker 构建和推送脚本
# ====================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置变量 (请修改为你的配置)
REGISTRY_URL="your-registry.com"  # 替换为你的私有registry地址
IMAGE_NAME="bookmark"
NAMESPACE="your-namespace"        # 替换为你的命名空间
VERSION_FILE="VERSION"

# 函数定义
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# 检查必要的工具
check_dependencies() {
    log_step "检查依赖工具..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装或不在PATH中"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "Git 未安装或不在PATH中"
        exit 1
    fi
    
    log_success "依赖检查通过"
}

# 获取版本号
get_version() {
    if [ -f "$VERSION_FILE" ]; then
        VERSION=$(cat $VERSION_FILE)
    else
        # 使用git标签或commit hash作为版本
        if git describe --tags --exact-match HEAD 2>/dev/null; then
            VERSION=$(git describe --tags --exact-match HEAD)
        else
            VERSION="v$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
        fi
        echo $VERSION > $VERSION_FILE
    fi
    log_info "使用版本: $VERSION"
}

# 构建Docker镜像
build_image() {
    log_step "开始构建Docker镜像..."
    
    # 构建多平台镜像
    PLATFORMS="linux/amd64,linux/arm64"
    FULL_IMAGE_NAME="$REGISTRY_URL/$NAMESPACE/$IMAGE_NAME"
    
    log_info "镜像名称: $FULL_IMAGE_NAME"
    log_info "版本标签: $VERSION"
    log_info "平台架构: $PLATFORMS"
    
    # 创建并使用buildx构建器
    docker buildx create --name bookmark-builder --use 2>/dev/null || docker buildx use bookmark-builder
    
    # 构建并推送镜像
    docker buildx build \
        --platform $PLATFORMS \
        --tag "$FULL_IMAGE_NAME:$VERSION" \
        --tag "$FULL_IMAGE_NAME:latest" \
        --push \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VCS_REF="$(git rev-parse --short HEAD)" \
        --build-arg VERSION="$VERSION" \
        .
    
    log_success "Docker镜像构建并推送完成"
    log_success "镜像地址: $FULL_IMAGE_NAME:$VERSION"
    log_success "最新标签: $FULL_IMAGE_NAME:latest"
}

# 生成部署文件
generate_deploy_files() {
    log_step "生成部署文件..."
    
    mkdir -p deploy
    
    # 生成kubernetes部署文件
    cat > deploy/k8s-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookmark-app
  labels:
    app: bookmark
    version: $VERSION
spec:
  replicas: 1
  selector:
    matchLabels:
      app: bookmark
  template:
    metadata:
      labels:
        app: bookmark
        version: $VERSION
    spec:
      containers:
      - name: bookmark
        image: $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: GIN_MODE
          value: "release"
        volumeMounts:
        - name: data-volume
          mountPath: /app/data
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: data-volume
        persistentVolumeClaim:
          claimName: bookmark-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: bookmark-service
  labels:
    app: bookmark
spec:
  selector:
    app: bookmark
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: bookmark-pvc
  labels:
    app: bookmark
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
EOF

    # 生成docker-compose生产配置
    cat > deploy/docker-compose.prod.yml << EOF
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
      - DATABASE_PATH=/app/data/bookmarks.db
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - bookmark_network

volumes:
  bookmark_data:
    driver: local

networks:
  bookmark_network:
    driver: bridge
EOF

    # 生成部署脚本
    cat > deploy/deploy.sh << 'EOF'
#!/bin/bash

# 部署脚本
set -e

echo "🚀 开始部署 BookMark 应用..."

# 检查是否在Kubernetes环境中
if command -v kubectl &> /dev/null && kubectl cluster-info &> /dev/null; then
    echo "📦 使用 Kubernetes 部署..."
    kubectl apply -f k8s-deployment.yaml
    echo "✅ Kubernetes 部署完成"
    echo "🔍 查看部署状态: kubectl get pods -l app=bookmark"
    echo "🌐 端口转发: kubectl port-forward service/bookmark-service 8080:80"
elif command -v docker-compose &> /dev/null; then
    echo "🐳 使用 Docker Compose 部署..."
    docker-compose -f docker-compose.prod.yml up -d
    echo "✅ Docker Compose 部署完成"
    echo "🔍 查看运行状态: docker-compose -f docker-compose.prod.yml ps"
    echo "🌐 访问地址: http://localhost:8080"
else
    echo "❌ 未找到 kubectl 或 docker-compose 命令"
    echo "请安装 Kubernetes CLI 或 Docker Compose"
    exit 1
fi

echo "🎉 部署完成!"
EOF

    chmod +x deploy/deploy.sh
    
    log_success "部署文件生成完成: deploy/ 目录"
}

# 清理构建器
cleanup() {
    log_step "清理构建环境..."
    docker buildx rm bookmark-builder 2>/dev/null || true
    log_success "清理完成"
}

# 显示使用方法
show_usage() {
    echo -e "${CYAN}BookMark Docker 构建和推送工具${NC}"
    echo ""
    echo -e "${YELLOW}使用方法:${NC}"
    echo "  $0 [选项]"
    echo ""
    echo -e "${YELLOW}选项:${NC}"
    echo "  -r, --registry    设置私有registry地址"
    echo "  -n, --namespace   设置命名空间"
    echo "  -v, --version     设置版本号"
    echo "  -h, --help        显示帮助信息"
    echo ""
    echo -e "${YELLOW}示例:${NC}"
    echo "  $0 -r registry.example.com -n myapp -v v1.2.3"
    echo "  $0 --registry=registry.example.com --namespace=myapp"
}

# 主函数
main() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                BookMark Docker 构建工具                  ║"
    echo "║                   支持多架构构建                         ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -r|--registry)
                REGISTRY_URL="$2"
                shift 2
                ;;
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                echo $VERSION > $VERSION_FILE
                shift 2
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # 检查必要配置
    if [ "$REGISTRY_URL" = "your-registry.com" ] || [ "$NAMESPACE" = "your-namespace" ]; then
        log_error "请配置你的私有registry地址和命名空间"
        log_warning "使用 -r 和 -n 参数设置，或编辑脚本中的配置变量"
        show_usage
        exit 1
    fi
    
    # 执行构建流程
    check_dependencies
    get_version
    build_image
    generate_deploy_files
    
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                   🎉 构建成功!                           ║"
    echo "║                                                          ║"
    echo "║  镜像地址: $REGISTRY_URL/$NAMESPACE/$IMAGE_NAME:$VERSION"
    echo "║  部署文件: deploy/ 目录                                   ║"
    echo "║  部署命令: cd deploy && ./deploy.sh                      ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 捕获退出信号，确保清理
trap cleanup EXIT

# 运行主函数
main "$@"
# ====================
# Build Stage
# ====================
FROM golang:1.21-alpine AS builder

# 配置镜像源并安装必要的构建工具和依赖（适用于亚太地区）
RUN echo "https://mirrors.ustc.edu.cn/alpine/v3.22/main" > /etc/apk/repositories && \
    echo "https://mirrors.ustc.edu.cn/alpine/v3.22/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache \
    gcc \
    musl-dev \
    sqlite-dev \
    git

# 设置工作目录
WORKDIR /app

# 复制 go mod 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 设置环境变量 - 修复 SQLite3 在 musl libc 上的兼容性问题
ENV CGO_ENABLED=1
ENV GOOS=linux
# 设置 SQLite3 构建标签，禁用 64 位文件操作以兼容 musl libc
ENV CGO_CFLAGS="-D_LARGEFILE64_SOURCE=0"
ENV CGO_LDFLAGS=""

# 构建应用 - 使用 sqlite3 的兼容性标签
RUN go build -tags "sqlite_omit_load_extension" -ldflags "-s -w" -o bookmark main.go

# ====================
# Production Stage
# ====================
FROM alpine:latest

# 配置镜像源并安装运行时依赖（适用于亚太地区）
RUN echo "https://mirrors.ustc.edu.cn/alpine/v3.22/main" > /etc/apk/repositories && \
    echo "https://mirrors.ustc.edu.cn/alpine/v3.22/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache \
    ca-certificates \
    sqlite \
    tzdata

# 设置时区
ENV TZ=Asia/Shanghai

# 创建非root用户
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

# 创建应用目录
WORKDIR /app

# 创建数据目录
RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# 从构建阶段复制二进制文件
COPY --from=builder /app/bookmark .
COPY --from=builder /app/static ./static

# 切换到非root用户
USER appuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# 暴露端口
EXPOSE 8080

# 设置数据库文件路径环境变量
ENV DATABASE_PATH=/app/data/bookmarks.db

# 启动应用
CMD ["./bookmark"]
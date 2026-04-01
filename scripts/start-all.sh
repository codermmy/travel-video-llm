#!/bin/bash

# =============================================================================
# 一键启动所有服务脚本
# =============================================================================
# 启动的服务包括:
#   1. Redis (依赖服务)
#   2. 后端 API (FastAPI + Uvicorn)
#   3. Celery Worker (异步任务处理)
#   4. 移动端 (Expo)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
MOBILE_DIR="$PROJECT_ROOT/mobile"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PID 文件目录
PID_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PID_DIR"

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

# 检查是否已经运行
check_running() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0  # 正在运行
        else
            rm -f "$pid_file"  # 清理 stale PID 文件
            return 1  # 未运行
        fi
    fi
    return 1  # 未运行
}

# 启动 Redis
start_redis() {
    log_info "检查 Redis 状态..."

    if redis-cli ping > /dev/null 2>&1; then
        log_success "Redis 已经在运行"
        return 0
    fi

    log_info "启动 Redis..."
    if command -v redis-server &> /dev/null; then
        redis-server --daemonize yes
        sleep 1
        if redis-cli ping > /dev/null 2>&1; then
            log_success "Redis 启动成功"
        else
            log_error "Redis 启动失败"
            return 1
        fi
    else
        log_warning "未找到 redis-server 命令，请手动启动 Redis"
        log_info "可以使用 'brew install redis' 安装 Redis"
    fi
}

# 启动后端 API
start_backend_api() {
    log_info "启动后端 API 服务..."

    if check_running "backend_api"; then
        local pid=$(cat "$PID_DIR/backend_api.pid")
        log_warning "后端 API 已经在运行 (PID: $pid)"
        return 0
    fi

    cd "$BACKEND_DIR"

    # 激活虚拟环境
    source "$BACKEND_DIR/.venv/bin/activate"

    # 启动后端服务
    nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 \
        > "$PROJECT_ROOT/logs/backend_api.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/backend_api.pid"

    sleep 2

    if ps -p "$pid" > /dev/null 2>&1; then
        log_success "后端 API 启动成功 (PID: $pid)"
    else
        log_error "后端 API 启动失败，查看日志：$PROJECT_ROOT/logs/backend_api.log"
        return 1
    fi
}

# 启动 Celery Worker
start_celery_worker() {
    log_info "启动 Celery Worker..."

    if check_running "celery_worker"; then
        local pid=$(cat "$PID_DIR/celery_worker.pid")
        log_warning "Celery Worker 已经在运行 (PID: $pid)"
        return 0
    fi

    cd "$BACKEND_DIR"

    # 激活虚拟环境
    source "$BACKEND_DIR/.venv/bin/activate"

    # 启动 Celery Worker (使用 solo 模式适配 macOS)
    nohup celery -A app.tasks.celery_app worker --loglevel=info --pool=solo \
        > "$PROJECT_ROOT/logs/celery_worker.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/celery_worker.pid"

    sleep 2

    if ps -p "$pid" > /dev/null 2>&1; then
        log_success "Celery Worker 启动成功 (PID: $pid)"
    else
        log_error "Celery Worker 启动失败，查看日志：$PROJECT_ROOT/logs/celery_worker.log"
        return 1
    fi
}

# 启动移动端
start_mobile() {
    log_info "启动移动端服务..."

    if check_running "mobile"; then
        local pid=$(cat "$PID_DIR/mobile.pid")
        log_warning "移动端已经在运行 (PID: $pid)"
        return 0
    fi

    cd "$MOBILE_DIR"

    # 启动 Expo 开发服务器
    nohup npm start \
        > "$PROJECT_ROOT/logs/mobile.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/mobile.pid"

    sleep 3

    if ps -p "$pid" > /dev/null 2>&1; then
        log_success "移动端服务启动成功 (PID: $pid)"
        log_info "访问 http://localhost:8081 查看 Expo 开发服务器"
    else
        log_error "移动端服务启动失败，查看日志：$PROJECT_ROOT/logs/mobile.log"
        return 1
    fi
}

# 主函数
main() {
    echo "=================================================="
    echo "       启动所有服务"
    echo "=================================================="
    echo ""

    # 创建日志目录
    mkdir -p "$PROJECT_ROOT/logs"

    # 1. 启动 Redis
    start_redis

    # 2. 启动后端 API
    start_backend_api

    # 3. 启动 Celery Worker
    start_celery_worker

    # 4. 启动移动端
    start_mobile

    echo ""
    echo "=================================================="
    echo "       所有服务启动完成!"
    echo "=================================================="
    echo ""
    echo "服务列表:"
    echo "  - 后端 API:      http://localhost:8000"
    echo "  - Celery Worker: 后台异步任务处理"
    echo "  - 移动端：       http://localhost:8081 (Expo)"
    echo ""
    echo "日志文件:"
    echo "  - 后端 API:   $PROJECT_ROOT/logs/backend_api.log"
    echo "  - Celery:     $PROJECT_ROOT/logs/celery_worker.log"
    echo "  - 移动端：     $PROJECT_ROOT/logs/mobile.log"
    echo ""
    echo "停止服务：bash $SCRIPT_DIR/stop-all.sh"
    echo "重启服务：bash $SCRIPT_DIR/restart-all.sh"
    echo ""
}

main

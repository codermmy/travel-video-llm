#!/bin/bash

# =============================================================================
# 一键启动所有服务脚本（前台版本）
# =============================================================================
# 直接在当前终端前台运行所有服务，可以看到实时日志
# 按 Ctrl+C 停止所有服务
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# 检查 Redis
check_redis() {
    log_info "检查 Redis 状态..."
    if redis-cli ping > /dev/null 2>&1; then
        log_success "Redis 已经在运行"
        return 0
    else
        log_error "Redis 未运行，请先启动 Redis: redis-server"
        return 1
    fi
}

# 主函数
main() {
    echo "=================================================="
    echo "       启动所有服务（前台模式）"
    echo "=================================================="
    echo ""
    echo "按 Ctrl+C 停止所有服务"
    echo ""

    # 创建日志目录
    mkdir -p "$PROJECT_ROOT/logs"

    # 检查 Redis
    check_redis || exit 1

    # 进入后端目录并激活虚拟环境
    cd "$BACKEND_DIR"
    source .venv/bin/activate

    echo ""
    echo "=================================================="
    echo "       服务信息"
    echo "=================================================="
    echo "  后端 API:      http://localhost:8000"
    echo "  手机访问：     http://$(ipconfig getifaddr en0):8000"
    echo "  Expo 开发服务器：http://localhost:8081"
    echo "  手机访问：     exp://$(ipconfig getifaddr en0):8081"
    echo "=================================================="
    echo ""

    # 设置 trap 捕获 Ctrl+C
    trap 'echo ""; log_info "正在停止所有服务..."; kill 0; exit 0' INT TERM

    # 启动后端 API（后台）
    log_info "启动后端 API..."
    uvicorn main:app --host 0.0.0.0 --port 8000 &

    sleep 2

    # 启动 Celery Worker（后台）
    log_info "启动 Celery Worker..."
    celery -A app.tasks.celery_app worker --loglevel=info --pool=solo &

    sleep 2

    # 启动移动端（前台，因为需要看到日志）
    log_info "启动移动端 Expo..."
    cd "$MOBILE_DIR"
    npm start

    # 等待所有后台进程
    wait
}

main

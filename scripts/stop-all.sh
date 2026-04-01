#!/bin/bash

# =============================================================================
# 停止所有服务脚本
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PID_DIR="$PROJECT_ROOT/.pids"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 停止单个服务
stop_service() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            log_info "停止 $service_name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true

            # 等待进程退出
            local count=0
            while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
                sleep 0.5
                count=$((count + 1))
            done

            # 如果还在运行，强制杀死
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi

            rm -f "$pid_file"
            log_success "$service_name 已停止"
        else
            rm -f "$pid_file"
            log_warning "$service_name 未在运行 (stale PID 文件已清理)"
        fi
    else
        log_warning "$service_name 没有 PID 文件"
    fi
}

# 通过进程名停止服务（备用方案）
stop_by_process() {
    local pattern=$1
    local name=$2

    log_info "检查并停止 $name..."

    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}' || true)

    if [ -n "$pids" ]; then
        for pid in $pids; do
            log_info "停止 $name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
        done

        sleep 1

        # 强制杀死仍然存在的进程
        for pid in $pids; do
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done

        log_success "$name 已停止"
    else
        log_warning "$name 未找到运行进程"
    fi
}

# 主函数
main() {
    echo "=================================================="
    echo "       停止所有服务"
    echo "=================================================="
    echo ""

    # 方法 1: 通过 PID 文件停止
    if [ -d "$PID_DIR" ]; then
        for pid_file in "$PID_DIR"/*.pid; do
            if [ -f "$pid_file" ]; then
                local service_name=$(basename "$pid_file" .pid)
                stop_service "$service_name"
            fi
        done
    fi

    # 方法 2: 通过进程名停止（备用）
    sleep 1
    stop_by_process "uvicorn main:app" "后端 API"
    stop_by_process "celery -A app.tasks.celery_app worker" "Celery Worker"
    stop_by_process "expo start" "Expo"
    stop_by_process "node.*expo" "移动端"

    # 清理 PID 目录
    rm -rf "$PID_DIR"
    mkdir -p "$PID_DIR"

    echo ""
    log_success "所有服务已停止"
    echo ""
    echo "启动服务：bash $SCRIPT_DIR/start-all.sh"
    echo "重启服务：bash $SCRIPT_DIR/restart-all.sh"
    echo ""
}

main

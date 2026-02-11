#!/bin/bash
# Maestro 测试运行脚本
# 自动获取本机 IP 并运行测试

# 获取本机局域网 IP（优先 WiFi，其次有线）
get_local_ip() {
    # macOS: 尝试 WiFi (en0)
    local ip=$(ipconfig getifaddr en0 2>/dev/null)
    
    # 如果 WiFi 没有，尝试有线 (en1)
    if [ -z "$ip" ]; then
        ip=$(ipconfig getifaddr en1 2>/dev/null)
    fi
    
    # 如果还是没有，用通用方法
    if [ -z "$ip" ]; then
        ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    fi
    
    echo "$ip"
}

# 配置
PORT="${EXPO_PORT:-8081}"
IP=$(get_local_ip)
DEV_SERVER_URL="http://${IP}:${PORT}"

# 检查 IP 是否获取成功
if [ -z "$IP" ]; then
    echo "❌ 无法获取本机 IP 地址"
    exit 1
fi

echo "📱 Maestro E2E 测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 开发服务器: $DEV_SERVER_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 运行测试
if [ -n "$1" ]; then
    # 运行指定的测试文件
    echo "🧪 运行测试: $1"
    ~/.maestro/bin/maestro test "$SCRIPT_DIR/flows/$1" -e DEV_SERVER_URL="$DEV_SERVER_URL"
else
    # 运行所有测试
    echo "🧪 运行所有测试..."
    ~/.maestro/bin/maestro test "$SCRIPT_DIR/flows/" -e DEV_SERVER_URL="$DEV_SERVER_URL"
fi

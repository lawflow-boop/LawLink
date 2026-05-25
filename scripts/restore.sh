#!/bin/bash
# LawLink 数据恢复脚本
# 用法: ./scripts/restore.sh <备份目录>
# 例如: ./scripts/restore.sh ./backups/20260524_020000

set -euo pipefail

BACKUP_PATH="${1:?用法: $0 <备份目录路径>}"

if [ ! -d "$BACKUP_PATH" ]; then
  echo "错误: 备份目录不存在: $BACKUP_PATH"
  exit 1
fi

# 从 .env 读取
if [ -f .env ]; then
  source .env
fi

DB_URL="${DATABASE_URL:-}"
STORAGE_DIR="${STORAGE_PATH:-./storage}"

if [ -z "$DB_URL" ]; then
  echo "错误: DATABASE_URL 未设置"
  exit 1
fi

DB_HOST=$(echo "$DB_URL" | sed -E 's/.*@([^:]+):.*/\1/')
DB_PORT=$(echo "$DB_URL" | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_NAME=$(echo "$DB_URL" | sed -E 's/.*\/([^?]+).*/\1/')
DB_USER=$(echo "$DB_URL" | sed -E 's/.*:\/\/([^:]+):.*/\1/')
DB_PASS=$(echo "$DB_URL" | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')

DUMP_FILE="${BACKUP_PATH}/database.dump"
STORAGE_FILE="${BACKUP_PATH}/storage.tar.gz"

echo "=== LawLink 数据恢复 ==="
echo "备份: ${BACKUP_PATH}"
echo "目标数据库: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo ""
echo "⚠️  警告: 此操作将覆盖当前数据库和文件存储！"
read -p "确认继续？(输入 YES): " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "已取消"
  exit 0
fi

# 1. 恢复数据库
if [ -f "$DUMP_FILE" ]; then
  echo "[1/2] 恢复数据库..."
  PGPASSWORD="$DB_PASS" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    "$DUMP_FILE"
  echo "  数据库恢复完成"
else
  echo "[1/2] 跳过: 未找到数据库备份文件"
fi

# 2. 恢复文件存储
if [ -f "$STORAGE_FILE" ]; then
  echo "[2/2] 恢复文件存储..."
  tar xzf "$STORAGE_FILE" -C "$(dirname "$STORAGE_DIR" 2>/dev/null || echo ".")"
  echo "  文件存储恢复完成"
else
  echo "[2/2] 跳过: 未找到文件存储备份"
fi

echo ""
echo "=== 恢复完成 ==="

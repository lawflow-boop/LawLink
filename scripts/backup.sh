#!/bin/bash
# LawLink 数据库 + 文件存储备份脚本
# 用法: ./scripts/backup.sh [/备份/目录]
# 默认备份到 ./backups/

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# 从 .env 读取数据库配置
if [ -f .env ]; then
  source .env
fi

DB_URL="${DATABASE_URL:-}"
STORAGE_DIR="${STORAGE_PATH:-./storage}"

if [ -z "$DB_URL" ]; then
  echo "错误: DATABASE_URL 未设置"
  exit 1
fi

# 从 DATABASE_URL 解析连接参数
# 格式: postgresql://user:password@host:port/database
DB_HOST=$(echo "$DB_URL" | sed -E 's/.*@([^:]+):.*/\1/')
DB_PORT=$(echo "$DB_URL" | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_NAME=$(echo "$DB_URL" | sed -E 's/.*\/([^?]+).*/\1/')
DB_USER=$(echo "$DB_URL" | sed -E 's/.*:\/\/([^:]+):.*/\1/')
DB_PASS=$(echo "$DB_URL" | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')

mkdir -p "$BACKUP_PATH"

echo "=== LawLink 备份 ${TIMESTAMP} ==="
echo "数据库: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "存储目录: ${STORAGE_DIR}"
echo ""

# 1. pg_dump
echo "[1/3] 导出数据库..."
PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=6 \
  -f "${BACKUP_PATH}/database.dump"
echo "  数据库备份完成: $(du -sh "${BACKUP_PATH}/database.dump" | cut -f1)"

# 2. 文件存储
echo "[2/3] 打包文件存储..."
if [ -d "$STORAGE_DIR" ]; then
  tar czf "${BACKUP_PATH}/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
  echo "  文件存储备份完成: $(du -sh "${BACKUP_PATH}/storage.tar.gz" | cut -f1)"
else
  echo "  跳过: 存储目录不存在"
fi

# 3. 元信息
echo "[3/3] 写入元信息..."
cat > "${BACKUP_PATH}/manifest.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "database": "${DB_NAME}",
  "storage_path": "${STORAGE_DIR}",
  "files": [
    {"name": "database.dump", "type": "pg_dump custom compressed"},
    {"name": "storage.tar.gz", "type": "tar gzip"}
  ]
}
EOF

echo ""
echo "=== 备份完成 ==="
echo "路径: ${BACKUP_PATH}"
echo "总大小: $(du -sh "$BACKUP_PATH" | cut -f1)"
echo ""
echo "建议: 将 ${BACKUP_PATH} 上传到异地存储（S3 / OSS / 其他服务器）"

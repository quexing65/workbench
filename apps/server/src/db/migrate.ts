import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { withTransaction } from './transaction.js';

const MIGRATION_FILE = /^(\d{4})-[a-z0-9-]+\.sql$/u;
const DEFAULT_MIGRATION_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

interface MigrationFile {
  readonly id: string;
  readonly checksum: string;
  readonly sql: string;
}

interface AppliedMigrationRow {
  readonly id: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly schemaVersion: number;
  readonly applied: readonly string[];
}

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeLineEndings(sql: string): string {
  return sql.replace(/\r\n?/gu, '\n');
}

/**
 * 迁移 SQL 的语义与行尾符无关，但 `.gitattributes` 的 `eol` 规则、`core.autocrlf`
 * 以及不同平台的检出会让同一份迁移在磁盘上呈现 CRLF 或 LF 两种字节形态。校验和按
 * 规范化行尾后的内容计算，保证同一语义内容在任何机器上都得到同一指纹。
 */
export function migrationChecksum(sql: string): string {
  return checksum(normalizeLineEndings(sql));
}

/**
 * 兼容在行尾规范化之前就已落库的历史记录：当时直接对原始字节求哈希，因此 CRLF
 * 形态的迁移会存下 CRLF 指纹。两种形态都视为同一内容，避免仅因换行符差异而拒绝
 * 启动。
 */
function isKnownChecksum(sql: string, stored: string): boolean {
  const canonical = normalizeLineEndings(sql);
  return stored === checksum(canonical) || stored === checksum(canonical.replaceAll('\n', '\r\n'));
}

function migrationFiles(directory: string): MigrationFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => {
      const sql = readFileSync(join(directory, entry.name), 'utf8');
      return { id: entry.name.slice(0, -4), checksum: migrationChecksum(sql), sql };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hasMigrationLedger(database: DatabaseSync): boolean {
  return (
    database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get() !== undefined
  );
}

function appliedMigrations(database: DatabaseSync): Map<string, string> {
  if (!hasMigrationLedger(database)) {
    return new Map();
  }

  const rows = database
    .prepare('SELECT id, checksum FROM schema_migrations ORDER BY id')
    .all() as unknown as AppliedMigrationRow[];
  return new Map(rows.map((row) => [row.id, row.checksum]));
}

function schemaVersion(
  files: readonly MigrationFile[],
  applied: ReadonlyMap<string, string>,
): number {
  const appliedFiles = files.filter((file) => applied.has(file.id));
  const latest = appliedFiles.at(-1);
  return latest === undefined ? 0 : Number(latest.id.slice(0, 4));
}

export function migrateDatabase(
  database: DatabaseSync,
  directory = DEFAULT_MIGRATION_DIRECTORY,
  now: () => number = Date.now,
): MigrationResult {
  if (!existsSync(directory)) {
    throw new Error('Migration directory is unavailable');
  }

  const files = migrationFiles(directory);
  if (files.length === 0) {
    throw new Error('No migration files were found');
  }

  const applied = appliedMigrations(database);
  for (const [id, storedChecksum] of applied) {
    const file = files.find((candidate) => candidate.id === id);
    if (file === undefined) {
      throw new Error(`Applied migration file is missing: ${id}`);
    }
    if (!isKnownChecksum(file.sql, storedChecksum)) {
      throw new Error(`Applied migration checksum mismatch: ${id}`);
    }
  }

  // 已应用集合必须是文件列表的前缀：否则新增一个低位编号迁移会在已升级的库上
  // 跳过中间版本后乱序执行，checksum 与数据模型都会失去意义。
  const appliedIds = [...applied.keys()];
  if (appliedIds.some((id, index) => files[index]?.id !== id)) {
    throw new Error('Applied migrations are not a prefix of the migration files');
  }

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file.id)) {
      continue;
    }

    withTransaction(database, () => {
      database.exec(file.sql);
      database
        .prepare('INSERT INTO schema_migrations (id, checksum, applied_at_ms) VALUES (?, ?, ?)')
        .run(file.id, file.checksum, now());
    });
    applied.set(file.id, file.checksum);
    newlyApplied.push(file.id);
  }

  return { schemaVersion: schemaVersion(files, applied), applied: newlyApplied };
}

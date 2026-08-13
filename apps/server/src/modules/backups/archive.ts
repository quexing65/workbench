import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { backupManifestSchema, type BackupManifest } from '@workbench/shared';
import { openPromise, type Entry, type ZipFile as ReadZipFile } from 'yauzl';
import { ZipFile } from 'yazl';

const MANIFEST_ENTRY = 'manifest.json';
const DATABASE_ENTRY = 'workbench.sqlite';
const EXPECTED_ENTRIES = new Set([MANIFEST_ENTRY, DATABASE_ENTRY]);
const MAX_ARCHIVE_BYTES = 520 * 1024 * 1024;
const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_COMPRESSION_RATIO = 100;

function safeEntry(entry: Entry, seen: Set<string>): void {
  const normalized = entry.fileName.toLowerCase();
  if (
    !EXPECTED_ENTRIES.has(entry.fileName) ||
    seen.has(normalized) ||
    entry.fileName.includes('\\') ||
    entry.fileName.includes('/') ||
    entry.fileName.includes('..') ||
    entry.isEncrypted() ||
    !entry.canDecodeFileData() ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    throw new Error('Backup archive contains an unsafe entry');
  }
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((unixMode & 0o170000) === 0o120000 || (entry.externalFileAttributes & 0x10) !== 0) {
    throw new Error('Backup archive contains a link or directory entry');
  }
  const maximum = entry.fileName === MANIFEST_ENTRY ? MAX_MANIFEST_BYTES : MAX_DATABASE_BYTES;
  if (entry.uncompressedSize <= 0 || entry.uncompressedSize > maximum) {
    throw new Error('Backup archive entry exceeds its size limit');
  }
  if (
    entry.compressedSize <= 0 ||
    (entry.fileName === DATABASE_ENTRY &&
      entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO)
  ) {
    throw new Error('Backup archive compression ratio is unsafe');
  }
  seen.add(normalized);
}

async function readEntry(zip: ReadZipFile, entry: Entry, maximum: number): Promise<Buffer> {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += buffer.length;
    if (bytes > maximum) throw new Error('Backup archive entry exceeded its streamed limit');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function writeEntry(zip: ReadZipFile, entry: Entry, destination: string): Promise<void> {
  const stream = await zip.openReadStreamPromise(entry);
  await pipeline(stream, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

export async function createBackupArchive(
  databasePath: string,
  manifest: BackupManifest,
  destination: string,
): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true });
  const archive = new ZipFile();
  const mtime = new Date(manifest.createdAt);
  archive.addBuffer(Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'), MANIFEST_ENTRY, {
    mtime,
    mode: 0o100600,
    compress: true,
  });
  archive.addFile(databasePath, DATABASE_ENTRY, { mtime, mode: 0o100600, compress: true });
  const completion = pipeline(archive.outputStream, createWriteStream(destination, { flags: 'wx' }));
  archive.end();
  await completion;
}

export interface ExtractedBackup {
  readonly manifest: BackupManifest;
  readonly databasePath: string;
}

export async function extractBackupArchive(
  archivePath: string,
  destinationDirectory: string,
): Promise<ExtractedBackup> {
  if (statSync(archivePath).size > MAX_ARCHIVE_BYTES) throw new Error('Backup archive is too large');
  mkdirSync(destinationDirectory, { recursive: true });
  const seen = new Set<string>();
  let manifestBuffer: Buffer | undefined;
  const databasePath = join(destinationDirectory, DATABASE_ENTRY);
  let zip: ReadZipFile | undefined;
  try {
    zip = await openPromise(archivePath, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    if (zip.entryCount !== 2) throw new Error('Backup archive must contain exactly two entries');
    for await (const entry of zip.eachEntry()) {
      safeEntry(entry, seen);
      if (entry.fileName === MANIFEST_ENTRY) {
        manifestBuffer = await readEntry(zip, entry, MAX_MANIFEST_BYTES);
      } else {
        await writeEntry(zip, entry, databasePath);
      }
    }
  } catch (error) {
    rmSync(destinationDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    zip?.close();
  }
  if (seen.size !== 2 || manifestBuffer === undefined) {
    rmSync(destinationDirectory, { recursive: true, force: true });
    throw new Error('Backup archive entries are incomplete');
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestBuffer.toString('utf8'));
  } catch {
    rmSync(destinationDirectory, { recursive: true, force: true });
    throw new Error('Backup manifest is invalid');
  }
  const parsed = backupManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    rmSync(destinationDirectory, { recursive: true, force: true });
    throw new Error('Backup manifest failed validation');
  }
  const bytes = statSync(databasePath).size;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(databasePath)) hash.update(chunk);
  if (bytes !== parsed.data.dbBytes || hash.digest('hex') !== parsed.data.dbSha256) {
    rmSync(destinationDirectory, { recursive: true, force: true });
    throw new Error('Backup database size or hash does not match the manifest');
  }
  return { manifest: parsed.data, databasePath };
}

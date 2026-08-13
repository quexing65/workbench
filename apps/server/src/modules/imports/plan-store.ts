import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { PersistedImportPlan } from './contracts.js';
import { hashValue, stableJson } from './source-hash.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function runDirectory(root: string, runId: string): string {
  if (!UUID.test(runId)) throw new RangeError('Import run ID is invalid');
  return join(root, runId);
}

export class ImportPlanStore {
  public constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  public directory(runId: string): string {
    return runDirectory(this.root, runId);
  }

  public sourcePath(runId: string): string {
    return join(this.directory(runId), 'source.bin');
  }

  public moveSource(runId: string, temporaryPath: string): string {
    const destination = this.sourcePath(runId);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(temporaryPath, destination);
    return destination;
  }

  public save(plan: PersistedImportPlan): void {
    const directory = this.directory(plan.runId);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, 'plan.json');
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, stableJson(plan), { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  }

  public saveConfirmation(runId: string, token: string): void {
    writeFileSync(join(this.directory(runId), 'confirmation-token'), token, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  }

  public loadConfirmation(runId: string): string {
    return readFileSync(join(this.directory(runId), 'confirmation-token'), 'utf8');
  }

  public load(runId: string): PersistedImportPlan {
    const value = JSON.parse(
      readFileSync(join(this.directory(runId), 'plan.json'), 'utf8'),
    ) as PersistedImportPlan;
    if (value.runId !== runId || value.planSha256 !== this.digest(value)) {
      throw new Error('Import plan verification failed');
    }
    return value;
  }

  public digest(plan: Omit<PersistedImportPlan, 'planSha256'> | PersistedImportPlan): string {
    const content = Object.fromEntries(
      Object.entries(plan).filter(([key]) => key !== 'planSha256'),
    );
    return hashValue(content);
  }

  public remove(runId: string): void {
    rmSync(this.directory(runId), { recursive: true, force: true });
  }

  public cleanup(activeRunIds: ReadonlySet<string>): void {
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'uploads') {
        rmSync(join(this.root, entry.name), { recursive: true, force: true });
      } else if (UUID.test(entry.name) && !activeRunIds.has(entry.name)) {
        this.remove(entry.name);
      }
    }
  }
}

import { describe, expect, it } from 'vitest';

import {
  biliCredentialStatusSchema,
  fetchBiliCredentialSchema,
  learningSyncRunSchema,
  saveBiliCredentialSchema,
  startLearningSyncSchema,
} from './bili-sync.js';

describe('Bili credential and sync contracts', () => {
  it('accepts only the secret save input and bounded sync pages', () => {
    const resourceId = '19dc0426-6277-4caf-bda7-e0f794833691';
    expect(saveBiliCredentialSchema.parse({ sessdata: ' test-value ' })).toEqual({
      sessdata: 'test-value',
    });
    expect(saveBiliCredentialSchema.safeParse({ sessdata: 'x', remember: true }).success).toBe(
      false,
    );
    expect(startLearningSyncSchema.parse({ resourceId })).toEqual({ resourceId, pages: 3 });
    expect(startLearningSyncSchema.safeParse({ resourceId, pages: 6 }).success).toBe(false);
    expect(startLearningSyncSchema.safeParse({ pages: 3 }).success).toBe(false);
  });

  it('requires an allowlisted browser and rejects unexpected restart fields', () => {
    expect(fetchBiliCredentialSchema.parse({ browser: 'edge' })).toEqual({
      browser: 'edge',
      forceRestart: false,
    });
    expect(fetchBiliCredentialSchema.safeParse({ browser: 'firefox' }).success).toBe(false);
    expect(
      fetchBiliCredentialSchema.safeParse({
        browser: 'edge',
        forceRestart: true,
        executable: 'C:/other/browser.exe',
      }).success,
    ).toBe(false);
  });

  it('does not permit credential material in status or sync responses', () => {
    expect(
      biliCredentialStatusSchema.safeParse({
        present: true,
        valid: true,
        userLabel: '已连接',
        sessdata: 'must-not-appear',
      }).success,
    ).toBe(false);
    expect(
      learningSyncRunSchema.safeParse({
        id: '19dc0426-6277-4caf-bda7-e0f794833691',
        status: 'succeeded',
        requestedPages: 3,
        historyCount: 2,
        updatedCount: 1,
        safeErrorCode: null,
        startedAt: '2026-08-13T01:00:00.000Z',
        finishedAt: '2026-08-13T01:00:01.000Z',
        createdAt: '2026-08-13T01:00:00.000Z',
        cookie: 'must-not-appear',
      }).success,
    ).toBe(false);
  });
});

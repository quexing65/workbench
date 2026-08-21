import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import express, { type Express } from 'express';
import type { Logger } from 'pino';

import type { ServerConfig } from './config.js';
import { errorHandler, notFound } from './http/errors.js';
import { createLogger, requestLogger } from './http/logger.js';
import { loopbackGuard } from './http/origin-guard.js';
import { requestId } from './http/request-id.js';
import { securityHeaders } from './http/security-headers.js';
import { mountStaticWeb } from './http/static-web.js';
import { createHealthRouter } from './modules/health/route.js';
import type { HealthDatabaseState } from './modules/health/route.js';
import { InsightRepository } from './modules/insights/repository.js';
import { createInsightRouter } from './modules/insights/route.js';
import { InsightService } from './modules/insights/service.js';
import { ImportService } from './modules/imports/import-service.js';
import { createImportRouter } from './modules/imports/route.js';
import { BiliSessionHttpClient, type BiliSessionClient } from './modules/bili/session-client.js';
import {
  LocalCdpAdapter,
  type BrowserCredentialAdapter,
} from './modules/credentials/cdp-adapter.js';
import { DpapiCredentialStore } from './modules/credentials/dpapi-store.js';
import { createCredentialRouter } from './modules/credentials/route.js';
import { CredentialService } from './modules/credentials/service.js';
import type { BiliCredentialStore } from './modules/credentials/store.js';
import { BiliHttpClient, type BiliClient } from './modules/learning/bili-client.js';
import { LearningResourceRepository } from './modules/learning/resource-repository.js';
import { createLearningRouter } from './modules/learning/route.js';
import { LearningSeriesRepository } from './modules/learning/series-repository.js';
import { LearningSeriesService } from './modules/learning/series-service.js';
import { LearningService } from './modules/learning/service.js';
import { NoteRepository } from './modules/notes/repository.js';
import { createNoteRouter } from './modules/notes/route.js';
import { NoteService } from './modules/notes/service.js';
import { RecurringRepository } from './modules/recurring/repository.js';
import { createRecurringRouter } from './modules/recurring/route.js';
import { RecurringService } from './modules/recurring/service.js';
import { TaskRepository } from './modules/tasks/repository.js';
import { createTaskRouter } from './modules/tasks/route.js';
import { TaskService } from './modules/tasks/service.js';
import { SyncRunRepository } from './modules/sync/repository.js';
import { createLearningSyncRouter } from './modules/sync/route.js';
import { LearningSyncService } from './modules/sync/service.js';
import { BackupService } from './modules/backups/service.js';
import { createBackupRouter } from './modules/backups/route.js';
import { resolveServerVersion } from './version.js';

export interface CreateAppOptions {
  readonly config: ServerConfig;
  readonly database: HealthDatabaseState & {
    readonly connection?: DatabaseSync;
  };
  readonly logger?: Logger;
  readonly biliClient?: BiliClient;
  readonly biliSessionClient?: BiliSessionClient;
  readonly credentialStore?: BiliCredentialStore;
  readonly browserCredentialAdapter?: BrowserCredentialAdapter;
  readonly mountImports?: boolean;
  readonly mountBackups?: boolean;
  readonly backupService?: Pick<BackupService, 'create'>;
  readonly serveWeb?: boolean;
  readonly webDistDirectory?: string;
  readonly version?: string;
}

const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));
const SERVER_VERSION = resolveServerVersion();

export function createApp(options: CreateAppOptions): Express {
  const { config } = options;
  const app = express();
  const logger = options.logger ?? createLogger(config);
  const sessionClient = options.biliSessionClient ?? new BiliSessionHttpClient();
  const credentialStore =
    options.credentialStore ??
    new DpapiCredentialStore(join(config.dataDirectory, 'credentials', 'credentials.bin'));
  const browserAdapter = options.browserCredentialAdapter ?? new LocalCdpAdapter();

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(securityHeaders);
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(loopbackGuard(config));
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));

  const api = express.Router();
  api.use(
    '/health',
    createHealthRouter(config, options.database, options.version ?? SERVER_VERSION),
  );
  api.use(
    '/bili/credential',
    createCredentialRouter(new CredentialService(credentialStore, sessionClient, browserAdapter)),
  );
  if (options.database.connection !== undefined) {
    const tasks = new TaskRepository(options.database.connection);
    const learningResources = new LearningResourceRepository(options.database.connection);
    const learningSeries = new LearningSeriesRepository(options.database.connection);
    api.use(
      '/',
      createInsightRouter(
        new InsightService(new InsightRepository(options.database.connection), tasks),
      ),
    );
    api.use('/tasks', createTaskRouter(new TaskService(tasks)));
    api.use(
      '/recurring-tasks',
      createRecurringRouter(
        new RecurringService(new RecurringRepository(options.database.connection)),
      ),
    );
    api.use(
      '/notes',
      createNoteRouter(new NoteService(new NoteRepository(options.database.connection))),
    );
    if (options.mountImports ?? true) {
      const importService = new ImportService(
        options.database.connection,
        join(config.dataDirectory, 'tmp', 'imports'),
        join(config.dataDirectory, 'backups'),
      );
      api.use(
        '/data/imports',
        createImportRouter(importService, join(config.dataDirectory, 'tmp', 'imports', 'uploads')),
      );
    }
    if (options.mountBackups ?? true) {
      api.use(
        '/data/backups',
        createBackupRouter(
          options.backupService ??
            new BackupService(options.database.connection, join(config.dataDirectory, 'backups')),
        ),
      );
    }
    const learningService = new LearningService(
      learningResources,
      learningSeries,
      options.biliClient ?? new BiliHttpClient(),
    );
    const syncService = new LearningSyncService(
      new SyncRunRepository(options.database.connection),
      credentialStore,
      sessionClient,
      learningResources,
      learningService,
    );
    api.use('/learning/sync', createLearningSyncRouter(syncService));
    api.use(
      '/learning',
      createLearningRouter(
        learningService,
        new LearningSeriesService(learningSeries, learningResources),
      ),
    );
  }
  api.use(notFound('API_NOT_FOUND', 'API 路由不存在'));
  app.use('/api/v1', api);
  app.use('/api', notFound('API_NOT_FOUND', 'API 路由不存在'));

  if (options.serveWeb ?? config.nodeEnv === 'production') {
    mountStaticWeb(app, options.webDistDirectory ?? DEFAULT_WEB_DIST);
  }

  app.use(notFound());
  app.use(errorHandler);

  return app;
}

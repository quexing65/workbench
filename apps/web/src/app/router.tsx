import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';

function page<T extends string>(loader: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(async () => ({ default: (await loader())[name] }));
}

const OverviewPage = page(() => import('../pages/overview/OverviewPage'), 'OverviewPage');
const TasksPage = page(() => import('../pages/tasks/TasksPage'), 'TasksPage');
const OverduePage = page(() => import('../pages/overdue/OverduePage'), 'OverduePage');
const RecurringPage = page(() => import('../pages/recurring/RecurringPage'), 'RecurringPage');
const NotesPage = page(() => import('../pages/notes/NotesPage'), 'NotesPage');
const LearningPage = page(() => import('../pages/learning/LearningPage'), 'LearningPage');
const ReviewPage = page(() => import('../pages/review/ReviewPage'), 'ReviewPage');
const DataPage = page(() => import('../pages/data/DataPage'), 'DataPage');

function PageLoader() {
  return (
    <div className="page-loader" role="status">
      正在打开页面…
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/overview" />} />
          <Route
            path="overview"
            element={
              <Suspense fallback={<PageLoader />}>
                <OverviewPage />
              </Suspense>
            }
          />
          <Route
            path="tasks"
            element={
              <Suspense fallback={<PageLoader />}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="overdue"
            element={
              <Suspense fallback={<PageLoader />}>
                <OverduePage />
              </Suspense>
            }
          />
          <Route
            path="recurring"
            element={
              <Suspense fallback={<PageLoader />}>
                <RecurringPage />
              </Suspense>
            }
          />
          <Route
            path="notes"
            element={
              <Suspense fallback={<PageLoader />}>
                <NotesPage />
              </Suspense>
            }
          />
          <Route
            path="learning"
            element={
              <Suspense fallback={<PageLoader />}>
                <LearningPage />
              </Suspense>
            }
          />
          <Route
            path="review"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReviewPage />
              </Suspense>
            }
          />
          <Route
            path="data"
            element={
              <Suspense fallback={<PageLoader />}>
                <DataPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate replace to="/overview" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

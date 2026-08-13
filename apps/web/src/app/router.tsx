import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataPage } from '../pages/data/DataPage';
import { LearningPage } from '../pages/learning/LearningPage';
import { NotesPage } from '../pages/notes/NotesPage';
import { OverviewPage } from '../pages/overview/OverviewPage';
import { RecurringPage } from '../pages/recurring/RecurringPage';
import { ReviewPage } from '../pages/review/ReviewPage';
import { TasksPage } from '../pages/tasks/TasksPage';
import { AppShell } from './AppShell';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/overview" />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="learning" element={<LearningPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="*" element={<Navigate replace to="/overview" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

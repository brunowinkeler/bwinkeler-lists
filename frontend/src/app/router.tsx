import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { LoginPage } from '../features/auth/LoginPage';
import { ListsOverviewPage } from '../features/lists/ListsOverviewPage';
import { ListPage } from '../features/lists/ListPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <ListsOverviewPage /> },
      { path: 'lists/:id', element: <ListPage /> },
    ],
  },
]);

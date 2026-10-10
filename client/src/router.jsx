import { createBrowserRouter } from 'react-router';
import Layout from './components/Layout.jsx';
import RouteError from './components/RouteError.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Route-level code splitting: each page ships as its own chunk and loads on demand.
const page = (loader) => async () => ({ Component: (await loader()).default });

export const routes = [
  {
    path: '/',
    Component: Layout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, lazy: page(() => import('./pages/Home.jsx')) },
      { path: 'explore', lazy: page(() => import('./pages/Explore.jsx')) },
      { path: 'neighborhood/:id', lazy: page(() => import('./pages/Neighborhood.jsx')) },
      { path: 'compare', lazy: page(() => import('./pages/Compare.jsx')) },
      { path: 'personalize', lazy: page(() => import('./pages/Personalize.jsx')) },
      { path: 'r/:token', lazy: page(() => import('./pages/PublicReport.jsx')) },
      { path: 'about', lazy: page(() => import('./pages/About.jsx')) },
      { path: 'privacy', lazy: page(() => import('./pages/Privacy.jsx')) },
      { path: 'terms', lazy: page(() => import('./pages/Terms.jsx')) },
      { path: 'login', lazy: page(() => import('./pages/Login.jsx')) },
      { path: 'register', lazy: page(() => import('./pages/Register.jsx')) },
      { Component: ProtectedRoute, children: [
        { path: 'account', lazy: page(() => import('./pages/Account.jsx')) },
        { path: 'saved', lazy: page(() => import('./pages/Saved.jsx')) },
        { path: 'reports', lazy: page(() => import('./pages/Reports.jsx')) },
        { path: 'report/:id', lazy: page(() => import('./pages/ReportView.jsx')) },
        { path: 'ai', lazy: page(() => import('./pages/Ai.jsx')) },
        { path: 'admin', lazy: page(() => import('./pages/admin/AdminLayout.jsx')), children: [
          { index: true, lazy: page(() => import('./pages/admin/Overview.jsx')) },
          { path: 'data', lazy: page(() => import('./pages/admin/DataHealth.jsx')) },
          { path: 'quality', lazy: page(() => import('./pages/admin/Quality.jsx')) },
          { path: 'security', lazy: page(() => import('./pages/admin/Security.jsx')) },
          { path: 'users', lazy: page(() => import('./pages/admin/Users.jsx')) },
        ] },
      ] },
      { path: '404', lazy: page(() => import('./pages/NotFound.jsx')) },
      { path: '*', lazy: page(() => import('./pages/NotFound.jsx')) },
    ],
  },
];

export const router = createBrowserRouter(routes);

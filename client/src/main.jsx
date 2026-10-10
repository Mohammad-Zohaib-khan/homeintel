import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './router.jsx';
import { AppProviders } from './AppProviders.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders><RouterProvider router={router} /></AppProviders>
  </React.StrictMode>,
);

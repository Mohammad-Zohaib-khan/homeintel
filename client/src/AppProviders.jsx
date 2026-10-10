import { ConsentProvider } from './lib/consent.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { CompareProvider } from './lib/compare.jsx';

export function AppProviders({ children }) {
  return (
    <ConsentProvider><ThemeProvider><ToastProvider><AuthProvider><CompareProvider>{children}</CompareProvider></AuthProvider></ToastProvider></ThemeProvider></ConsentProvider>
  );
}

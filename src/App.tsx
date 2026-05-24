import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomTabBar } from './components/BottomTabBar';
import { Footer } from './components/Footer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { OfflineBanner } from './components/OfflineBanner';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './theme/ThemeProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ChatHost, useChatHost } from './chat/ChatHost';
import { DrillProvider } from './drill/DrillContext';
// Each route is split into its own chunk so the main bundle doesn't
// drag recharts (Analyze), dexie-export-import (Settings → Storage),
// or the ECO database (Openings/Analyze) into the initial paint for
// users landing on Home.
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const AnalyzePage = lazy(() => import('./pages/AnalyzePage').then((m) => ({ default: m.AnalyzePage })));
const OpeningsPage = lazy(() => import('./pages/OpeningsPage').then((m) => ({ default: m.OpeningsPage })));
const PlanPage = lazy(() => import('./pages/PlanPage').then((m) => ({ default: m.PlanPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
import './styles/board.css';

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <DrillProvider>
          <ChatHost>
            <AppShell />
          </ChatHost>
        </DrillProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

/**
 * Inner shell - split out so it can read the chat-open state via
 * useChatHost() and push main content to the left when the chat rail is
 * open on desktop. On mobile the chat sheet covers the bottom half of the
 * viewport, so no horizontal push is needed.
 *
 * The push uses padding-right so the fixed chat panel doesn't overlap the
 * main column. Transition keeps the reflow smooth instead of snapping.
 */
function AppShell() {
  const chat = useChatHost();
  return (
    <div className="flex min-h-full flex-col pb-24 md:pb-0">
      <Header />
      <main
        className={`mx-auto w-full max-w-7xl flex-1 px-4 py-6 transition-[padding] duration-200 ${
          chat.open ? 'md:pr-[420px]' : ''
        }`}
      >
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="card grid place-items-center py-16 text-sm text-muted">
                Loading…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/analyze" element={<AnalyzePage />} />
              <Route path="/study" element={<OpeningsPage />} />
              {/* Backward-compat: the route used to be /openings. Preserve any
                  query params (e.g. ?search=Caro-Kann from Analyze deep-links)
                  so old bookmarks + in-flight Analyze links keep working. */}
              <Route path="/openings" element={<Navigate to="/study" replace />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <BottomTabBar />
      <UpdatePrompt />
      <OfflineBanner />
      <KeyboardShortcutsModal />
    </div>
  );
}

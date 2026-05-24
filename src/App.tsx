import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomTabBar } from './components/BottomTabBar';
import { Footer } from './components/Footer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ThemeProvider } from './theme/ThemeProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ChatHost, useChatHost } from './chat/ChatHost';
import { DrillProvider } from './drill/DrillContext';
import { HomePage } from './pages/HomePage';
import { AnalyzePage } from './pages/AnalyzePage';
import { OpeningsPage } from './pages/OpeningsPage';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
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
 * Inner shell — split out so it can read the chat-open state via
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
      </main>
      <Footer />
      <BottomTabBar />
      <UpdatePrompt />
      <KeyboardShortcutsModal />
    </div>
  );
}

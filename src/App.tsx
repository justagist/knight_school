import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomTabBar } from './components/BottomTabBar';
import { Footer } from './components/Footer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { ThemeProvider } from './theme/ThemeProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ChatHost } from './chat/ChatHost';
import { DrillProvider } from './drill/DrillContext';
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
          {/* pb-24 on the column container clears the fixed BottomTabBar
              (~64px) plus the FAB sitting above it on mobile. Footer stays
              inside the flow so it sits above the bar, not hidden behind. */}
          <div className="flex min-h-full flex-col pb-24 md:pb-0">
            <Header />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
              <Routes>
                <Route path="/" element={<AnalyzePage />} />
                <Route path="/openings" element={<OpeningsPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
            <Footer />
            <BottomTabBar />
            <UpdatePrompt />
          </div>
        </ChatHost>
        </DrillProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

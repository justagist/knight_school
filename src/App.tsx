import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { ThemeProvider } from './theme/ThemeProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ChatHost } from './chat/ChatHost';
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
        <ChatHost>
          <div className="flex min-h-full flex-col">
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
            <UpdatePrompt />
          </div>
        </ChatHost>
      </SettingsProvider>
    </ThemeProvider>
  );
}

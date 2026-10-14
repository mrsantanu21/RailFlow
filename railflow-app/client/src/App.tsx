import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { AuthModal } from './components/common/AuthModal';
import { AiAssistantPanel } from './components/ai/AiAssistantPanel';
import { SearchPage } from './pages/SearchPage';
import { PNRStatusPage } from './pages/PNRStatusPage';
import { LiveTrackingPage } from './pages/LiveTrackingPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 3, // 3 minutes
    },
  },
});

const AppContent: React.FC = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const navigate = useNavigate();

  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface font-sans selection:bg-secondary-container selection:text-on-secondary-container transition-colors">
      <Navbar
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenAiAssistant={() => setAiPanelOpen((prev) => !prev)}
      />

      <main className={`flex-1 flex flex-col ${isHome ? '' : 'pt-20'}`}>
        <Routes>
          <Route
            path="/"
            element={
              <SearchPage
                onRequireAuth={() => setAuthModalOpen(true)}
                onNavigateToPNR={(pnr: string) => navigate(`/pnr?pnr=${encodeURIComponent(pnr)}`)}
              />
            }
          />
          <Route
            path="/pnr"
            element={<PNRStatusPage onRequireAuth={() => setAuthModalOpen(true)} />}
          />
          <Route
            path="/trips"
            element={
              <PNRStatusPage
                defaultTab="trips"
                onRequireAuth={() => setAuthModalOpen(true)}
              />
            }
          />
          <Route path="/tracking" element={<LiveTrackingPage />} />
          <Route
            path="/admin"
            element={
              <AdminDashboardPage
                onRequireAuth={() => setAuthModalOpen(true)}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <AiAssistantPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        onPopulateSearch={(params) =>
          navigate(
            `/?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}${
              params.date ? `&date=${encodeURIComponent(params.date)}` : ''
            }`
          )
        }
      />
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AdminRoute from './auth/AdminRoute';
import { ScopeProvider } from './lib/scope';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import AskPage from './pages/AskPage';
import EarningsPage from './pages/EarningsPage';
import MemoryJourneyPage from './pages/MemoryJourneyPage';
import MemoryInspectorPage from './pages/MemoryInspectorPage';
import ComparePage from './pages/ComparePage';
import InvestigationsPage from './pages/InvestigationsPage';
import InvestigationWorkspacePage from './pages/InvestigationWorkspacePage';
import ReportPage from './pages/ReportPage';
import JudgeDemoPage from './pages/JudgeDemoPage';
import ArchitecturePage from './pages/ArchitecturePage';
import AdminConsolePage from './pages/admin/AdminConsolePage';

const WORKER_SCOPE = { api: '/me', link: '', isAdminView: false, workerId: null };

const workerPages = (
  <>
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="ask" element={<AskPage />} />
    <Route path="earnings" element={<EarningsPage />} />
    <Route path="memory" element={<MemoryJourneyPage />} />
    <Route path="memory/inspector" element={<MemoryInspectorPage />} />
    <Route path="compare" element={<ComparePage />} />
    <Route path="investigations" element={<InvestigationsPage />} />
    <Route path="investigations/:id" element={<InvestigationWorkspacePage />} />
    <Route path="investigations/:id/reports/:reportId" element={<ReportPage />} />
  </>
);

const AdminWorkerScope = () => {
  const { workerId } = useParams();
  return (
    <ScopeProvider value={{ api: `/admin/workers/${workerId}`, link: `/admin/workers/${workerId}`, isAdminView: true, workerId }}>
      <Layout />
    </ScopeProvider>
  );
};

const Home = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="content"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to={user.workerProfile ? '/dashboard' : '/onboarding'} replace />;
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route element={<ProtectedRoute><ScopeProvider value={WORKER_SCOPE}><Layout /></ScopeProvider></ProtectedRoute>}>
          {workerPages}
          <Route path="demo" element={<JudgeDemoPage />} />
          <Route path="architecture" element={<ArchitecturePage />} />
          <Route path="admin" element={<AdminRoute><AdminConsolePage /></AdminRoute>} />
        </Route>
        <Route path="/admin/workers/:workerId" element={<AdminRoute><AdminWorkerScope /></AdminRoute>}>
          {workerPages}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;

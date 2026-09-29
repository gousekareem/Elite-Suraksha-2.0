import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Loading } from '../components/ui';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="content"><Loading label="Loading your workspace…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export default ProtectedRoute;

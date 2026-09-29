import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Loading } from '../components/ui';

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="content"><Loading label="Loading…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return children;
};

export default AdminRoute;

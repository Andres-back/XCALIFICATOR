import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminMaterias from './pages/admin/Materias';
import AdminAuditLog from './pages/admin/AuditLog';
import ProfesorMaterias from './pages/profesor/Materias';
import ProfesorExamenes from './pages/profesor/Examenes';
import ProfesorGenerar from './pages/profesor/GenerarExamen';
import ProfesorCalificar from './pages/profesor/Calificar';
import ProfesorNotas from './pages/profesor/Notas';
import MateriaDetail from './pages/profesor/MateriaDetail';
import EstudianteHome from './pages/estudiante/Home';
import EstudianteNotas from './pages/estudiante/Notas';
import EstudianteExamen from './pages/estudiante/ResolverExamen';
import EstudianteChat from './pages/estudiante/Chat';
import Perfil from './pages/Perfil';
import Layout from './components/Layout';

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (roles && !roles.includes(user?.rol)) return <Navigate to="/" />;
  return children;
}

function getHomeRoute(rol) {
  switch (rol) {
    case 'admin': return '/admin';
    case 'profesor': return '/profesor/materias';
    case 'estudiante': return '/estudiante';
    default: return '/login';
  }
}

function HomeRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <Navigate to={getHomeRoute(user?.rol)} />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<HomeRedirect />} />

        {/* Admin */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}>
            <Layout><AdminDashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute roles={['admin']}>
            <Layout><AdminUsers /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/materias" element={
          <ProtectedRoute roles={['admin']}>
            <Layout><AdminMaterias /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/audit" element={
          <ProtectedRoute roles={['admin']}>
            <Layout><AdminAuditLog /></Layout>
          </ProtectedRoute>
        } />

        {/* Profesor */}
        <Route path="/profesor/materias" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><ProfesorMaterias /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/profesor/materia/:materiaId" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><MateriaDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/profesor/examenes/:materiaId" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><ProfesorExamenes /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/profesor/generar/:materiaId" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><ProfesorGenerar /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/profesor/calificar/:examenId" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><ProfesorCalificar /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/profesor/notas/:examenId" element={
          <ProtectedRoute roles={['profesor', 'admin']}>
            <Layout><ProfesorNotas /></Layout>
          </ProtectedRoute>
        } />

        {/* Estudiante */}
        <Route path="/estudiante" element={
          <ProtectedRoute roles={['estudiante']}>
            <Layout><EstudianteHome /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/estudiante/notas" element={
          <ProtectedRoute roles={['estudiante']}>
            <Layout><EstudianteNotas /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/estudiante/examen/:examenId" element={
          <ProtectedRoute roles={['estudiante']}>
            <Layout><EstudianteExamen /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/estudiante/chat/:notaId" element={
          <ProtectedRoute roles={['estudiante']}>
            <Layout><EstudianteChat /></Layout>
          </ProtectedRoute>
        } />

        {/* Common */}
        <Route path="/perfil" element={
          <ProtectedRoute>
            <Layout><Perfil /></Layout>
          </ProtectedRoute>
        } />

        {/* 404 catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

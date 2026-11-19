import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CitizenHomePage } from '../pages/citizen/CitizenHomePage';
import { CitizenMapPage } from '../pages/citizen/CitizenMapPage';
import { CitizenRegisterPage } from '../pages/citizen/CitizenRegisterPage';
import { CitizenRequestsPage } from '../pages/citizen/CitizenRequestsPage';
import { CitizenDetailPage } from '../pages/citizen/CitizenDetailPage';
import { ResetPasswordPage } from '../pages/citizen/ResetPasswordPage';
import { PublicTransparencyPage } from '../pages/public/PublicTransparencyPage';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminRequestsPage } from '../pages/admin/AdminRequestsPage';
import { AdminTreatOccurrencePage } from '../pages/admin/AdminTreatOccurrencePage';
import { AdminMapPage } from '../pages/admin/AdminMapPage';
import { AdminReportsPage } from '../pages/admin/AdminReportsPage';
import { AdminDepartmentsPage } from '../pages/admin/AdminDepartmentsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminDeadlinesPage } from '../pages/admin/AdminDeadlinesPage';
import { AdminRatingsPage } from '../pages/admin/AdminRatingsPage';
import { AdminAuditPage } from '../pages/admin/AdminAuditPage';
import { AdminAccountPage } from '../pages/admin/AdminAccountPage';
import { PublicOpenDataPage } from '../pages/public/PublicOpenDataPage';
import { UserRole } from '@cidade-em-foco/shared';
import { ApiError, isStaff } from '../lib/api';
import { useSessionUser } from '../lib/queries';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Erros de autenticação, permissão e "não encontrado" não melhoram com nova tentativa
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Guarda das rotas administrativas: só servidores municipais autenticados entram.
 * A autorização de fato é feita pela API (JWT + papel); aqui evitamos exibir
 * o painel a quem não tem sessão e redirecionamos quando ela expira.
 */
const RequireStaff: React.FC = () => {
  const user = useSessionUser();
  const location = useLocation();
  if (!isStaff(user)) {
    return (
      <Navigate
        to="/admin/entrar"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
};

/** Restringe a rota ao perfil Administrador (a API também exige o papel). */
const RequireAdmin: React.FC = () => {
  const user = useSessionUser();
  return user?.role === UserRole.ADMIN ? <Outlet /> : <Navigate to="/admin" replace />;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Páginas públicas, sem login: o cidadão com conta usa o aplicativo mobile */}
          <Route path="/" element={<CitizenHomePage />} />
          <Route path="/mapa" element={<CitizenMapPage />} />
          <Route path="/registrar" element={<CitizenRegisterPage />} />
          <Route path="/solicitacoes" element={<CitizenRequestsPage />} />
          <Route path="/solicitacoes/:id" element={<CitizenDetailPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

          {/* Ambiente Público de Transparência (Tela 8) */}
          <Route path="/transparencia" element={<PublicTransparencyPage />} />
          <Route path="/dados-abertos" element={<PublicOpenDataPage />} />

          {/* Ambiente Administrativo Completo (Telas 9 a 15) */}
          <Route path="/admin/entrar" element={<AdminLoginPage />} />
          <Route element={<RequireStaff />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/solicitacoes" element={<AdminRequestsPage />} />
            <Route
              path="/admin/solicitacoes/:id"
              element={<AdminTreatOccurrencePage />}
            />
            <Route path="/admin/prazos" element={<AdminDeadlinesPage />} />
            <Route path="/admin/avaliacoes" element={<AdminRatingsPage />} />
            <Route path="/admin/conta" element={<AdminAccountPage />} />
            <Route path="/admin/mapa" element={<AdminMapPage />} />
            <Route path="/admin/relatorios" element={<AdminReportsPage />} />
            <Route
              path="/admin/departamentos"
              element={<AdminDepartmentsPage />}
            />
            {/* Cadastro de usuários de atendimento: somente Administrador */}
            <Route element={<RequireAdmin />}>
              <Route path="/admin/usuarios" element={<AdminUsersPage />} />
              <Route path="/admin/auditoria" element={<AdminAuditPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/transparencia" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

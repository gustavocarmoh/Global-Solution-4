import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Menu, Target, X } from 'lucide-react';
import { UserRole } from '@cidade-em-foco/shared';
import { AdminSidebar } from '../../components/DesignSystem';
import { apiFetch, clearStoredSession } from '../../lib/api';
import { useSessionUser } from '../../lib/queries';

const ROLE_LABELS: Record<string, string> = {
  [UserRole.TRIAGE]: 'Atendimento e triagem',
  [UserRole.DEPARTMENT]: 'Departamento responsável',
  [UserRole.MANAGER]: 'Gestor',
  [UserRole.ADMIN]: 'Administrador',
};

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  // Em telas pequenas o menu vira uma gaveta aberta pelo botão "Menu"
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Mesmo sem resposta do servidor, a sessão local é encerrada
    }
    clearStoredSession();
    queryClient.clear();
    navigate('/admin/entrar');
  };

  const roleLabel = user ? ROLE_LABELS[user.role] || 'Gestão Municipal' : '';

  return (
    <div className="admin-shell" data-menu-open={menuOpen}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>

      <div className="admin-topbar">
        <span className="admin-topbar-brand">
          <span className="public-brand-mark" style={{ width: 36, height: 36 }}>
            <Target size={20} aria-hidden="true" />
          </span>
          <strong>Cidade em Foco</strong>
        </span>
        <button
          type="button"
          className="cf-btn cf-btn-secondary"
          aria-expanded={menuOpen}
          aria-controls="admin-sidebar"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          <span>Menu</span>
        </button>
      </div>

      <AdminSidebar
        id="admin-sidebar"
        isAdmin={user?.role === UserRole.ADMIN}
        userName={user?.name}
        userRoleLabel={
          user?.departmentName ? `${roleLabel} — ${user.departmentName}` : roleLabel
        }
        onLogout={handleLogout}
      />

      <main id="main-content" className="admin-main">
        {children}
      </main>
    </div>
  );
};

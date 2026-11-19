import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, Target } from 'lucide-react';
import { apiFetch, clearStoredSession, isStaff } from '../lib/api';
import { useSessionUser } from '../lib/queries';

/** Cabeçalho das páginas públicas: navegação de site e acesso institucional (login/logout). */
export const PublicHeader: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const staff = isStaff(user);

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Mesmo sem resposta do servidor, a sessão local é encerrada
    }
    clearStoredSession();
    queryClient.clear();
    navigate('/');
  };

  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link to="/" className="public-brand" aria-label="Cidade em Foco — página inicial">
          <span className="public-brand-mark">
            <Target size={22} aria-hidden="true" />
          </span>
          <span>
            <strong>Cidade em Foco</strong>
            <small>Zeladoria urbana e participação cidadã</small>
          </span>
        </Link>

        <nav className="public-nav" aria-label="Navegação principal">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/mapa">Mapa</NavLink>
          <NavLink to="/solicitacoes">Consultar protocolo</NavLink>
          <NavLink to="/transparencia">Transparência</NavLink>
          <NavLink to="/dados-abertos">Dados abertos</NavLink>
        </nav>

        <div className="public-actions">
          <Link to="/registrar" className="cf-btn cf-btn-primary">
            Registrar problema
          </Link>
          {staff ? (
            <>
              <Link to="/admin" className="cf-btn cf-btn-secondary">
                Painel
              </Link>
              <button type="button" className="cf-btn cf-btn-ghost" onClick={handleLogout}>
                <LogOut size={16} aria-hidden="true" />
                <span>Sair</span>
              </button>
            </>
          ) : (
            <Link to="/admin/entrar" className="cf-btn cf-btn-secondary">
              <LogIn size={16} aria-hidden="true" />
              <span>Acesso institucional</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

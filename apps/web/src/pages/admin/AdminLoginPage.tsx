import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Target, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, Notice } from '../../components/DesignSystem';
import {
  apiFetch,
  consumeSessionExpiredFlag,
  errorMessage,
  isStaff,
  setStoredSession,
} from '../../lib/api';
import { useSessionUser } from '../../lib/queries';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo: string =
    (location.state as { from?: string } | null)?.from || '/admin/solicitacoes';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(() =>
    (location.state as { notice?: string } | null)?.notice ??
      (consumeSessionExpiredFlag() ? 'Sua sessão expirou. Entre novamente.' : null),
  );
  const sessionUser = useSessionUser();
  const [loading, setLoading] = useState(false);

  // Quem já está logado não precisa ver o login de novo
  if (isStaff(sessionUser)) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredSession(
        { accessToken: data.accessToken, refreshToken: data.refreshToken },
        data.user,
      );
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        errorMessage(err, 'Não foi possível autenticar. Verifique os dados informados.'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo(res.message);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível solicitar a redefinição de senha.'));
    }
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh / var(--ui-zoom))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-5)',
        backgroundColor: 'var(--surface-100)',
      }}
    >
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>

      <main id="main-content" style={{ width: '100%', maxWidth: 460 }}>
        <Card style={{ padding: 'var(--space-6)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--brand)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={26} aria-hidden="true" />
            </div>
            <div>
              <h1 className="h2">Cidade em Foco</h1>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
                Acesso Institucional e Operação Municipal
              </div>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Notice variant="danger">{error}</Notice>
            </div>
          )}

          {info && (
            <div style={{ marginBottom: 'var(--space-4)' }} role="status">
              <Notice variant="info">{info}</Notice>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Field label="E-mail institucional" required>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  className="cf-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="servidor@cidadeemfoco.gov.br"
                  autoComplete="username"
                  autoFocus
                  required
                />
              )}
            </Field>

            <Field label="Senha" required>
              {(props) => (
                <input
                  {...props}
                  type="password"
                  className="cf-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>

            <Button type="submit" variant="primary" fullWidth disabled={loading}>
              {loading ? 'Autenticando...' : 'Entrar'}
            </Button>

            <div style={{ textAlign: 'center', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="cf-btn cf-btn-ghost"
                style={{ fontSize: 'var(--fs-small)' }}
              >
                Esqueci a senha
              </button>
            </div>
          </form>

          <div
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--surface-300)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 13,
              color: 'var(--ink-muted)',
            }}
          >
            <ShieldCheck size={18} aria-hidden="true" color="var(--brand)" />
            <span>Acessos e ações ficam registrados em auditoria.</span>
          </div>
        </Card>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Button, Card, Field, Notice } from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { apiFetch, errorMessage } from '../../lib/api';

/** Tela aberta pelo link enviado por e-mail: define a nova senha da conta. */
export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas digitadas não são iguais.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(res.message);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível redefinir a senha.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="citizen-shell" style={{ paddingBottom: 'var(--space-6)' }}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <PublicHeader />
      <main
        id="main-content"
        className="public-narrow"
        style={{
          padding: 'var(--space-5) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--brand)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Target size={30} aria-hidden="true" />
          </div>
          <h1 className="h1">Redefinir senha</h1>
        </div>

        <Card>
          {!token ? (
            <Notice variant="danger">
              Link de redefinição inválido. Solicite um novo link em “Esqueci a senha”.
            </Notice>
          ) : done ? (
            <div role="status">
              <Notice variant="info">{done}</Notice>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <Notice variant="danger">{error}</Notice>
                </div>
              )}
              <Field label="Nova senha" hint="Mínimo de 6 caracteres" required>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    className="cf-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                )}
              </Field>
              <Field label="Confirmar nova senha" required>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    className="cf-input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" fullWidth disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-4)',
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Cidadãos entram com a nova senha pelo aplicativo.
            </p>
            <Link to="/admin/entrar" className="cf-btn cf-btn-secondary">
              Acesso institucional
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
};

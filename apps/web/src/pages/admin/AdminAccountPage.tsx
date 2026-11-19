import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@cidade-em-foco/shared';
import { Button, Card, ErrorBlock, Field, LoadingBlock, Notice } from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import {
  apiFetch,
  clearStoredSession,
  errorMessage,
  getStoredTokens,
  updateStoredUser,
} from '../../lib/api';

const ROLE_LABELS: Record<string, string> = {
  [UserRole.TRIAGE]: 'Atendimento e triagem',
  [UserRole.DEPARTMENT]: 'Departamento responsável',
  [UserRole.MANAGER]: 'Gestor',
  [UserRole.ADMIN]: 'Administrador',
};

/** Fim da sessão atual, lido do refresh token (a sessão tem duração absoluta). */
function sessionEnd(): Date | null {
  try {
    const token = getStoredTokens()?.refreshToken;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/** Dados da própria conta de atendimento: perfil, troca de senha e validade da sessão. */
export const AdminAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useQuery<any>({ queryKey: ['me-profile'], queryFn: () => apiFetch('/me/profile') });
  const profile = profileQuery.data;

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    setSavingProfile(true);
    try {
      const updated = await apiFetch('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name ?? profile.name, phone: phone ?? profile.phone ?? '' }),
      });
      updateStoredUser({ name: updated.name, phone: updated.phone });
      queryClient.setQueryData(['me-profile'], { ...profile, ...updated });
      setName(null);
      setPhone(null);
      setProfileMsg('Dados atualizados com sucesso.');
    } catch (err) {
      setProfileErr(errorMessage(err, 'Não foi possível atualizar seus dados.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErr(null);
    if (next.length < 8) {
      setPasswordErr('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (next !== confirm) {
      setPasswordErr('A confirmação não é igual à nova senha.');
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      // A API encerra as sessões abertas: entra de novo com a nova senha
      clearStoredSession();
      queryClient.clear();
      navigate('/admin/entrar', { state: { notice: 'Senha alterada com sucesso. Entre com a nova senha.' } });
    } catch (err) {
      setPasswordErr(errorMessage(err, 'Não foi possível alterar a senha.'));
      setSavingPassword(false);
    }
  };

  const end = sessionEnd();

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Minha conta</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Seus dados de atendimento e a segurança do seu acesso
        </p>
      </div>

      {profileQuery.isLoading && <LoadingBlock label="Carregando seus dados..." />}
      {profileQuery.error && <ErrorBlock error={profileQuery.error} onRetry={() => profileQuery.refetch()} />}

      {profile && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: 'var(--space-5)',
            alignItems: 'start',
          }}
        >
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              Dados do perfil
            </h2>
            <dl style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--fs-small)' }}>
              <dt style={{ color: 'var(--ink-muted)' }}>E-mail (usado no login)</dt>
              <dd style={{ margin: '0 0 var(--space-2) 0', fontWeight: 700 }}>{profile.email}</dd>
              <dt style={{ color: 'var(--ink-muted)' }}>Perfil</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{ROLE_LABELS[profile.role] || profile.role}</dd>
            </dl>

            {profileMsg && (
              <div style={{ marginBottom: 'var(--space-3)' }} role="status">
                <Notice variant="info">{profileMsg}</Notice>
              </div>
            )}
            {profileErr && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Notice variant="danger">{profileErr}</Notice>
              </div>
            )}
            <form onSubmit={handleProfile}>
              <Field label="Nome">
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className="cf-input"
                    value={name ?? profile.name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Telefone">
                {(props) => (
                  <input
                    {...props}
                    type="tel"
                    className="cf-input"
                    value={phone ?? profile.phone ?? ''}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" fullWidth disabled={savingProfile}>
                {savingProfile ? 'Salvando...' : 'Salvar dados'}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              Alterar senha
            </h2>
            <p style={{ marginTop: 0, fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Ao trocar a senha, todas as sessões abertas são encerradas e você entra novamente.
            </p>
            {passwordErr && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Notice variant="danger">{passwordErr}</Notice>
              </div>
            )}
            <form onSubmit={handlePassword}>
              <Field label="Senha atual" required>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    className="cf-input"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                )}
              </Field>
              <Field label="Nova senha" hint="Mínimo de 8 caracteres" required>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    className="cf-input"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
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
              <Button type="submit" variant="primary" fullWidth disabled={savingPassword}>
                {savingPassword ? 'Alterando...' : 'Alterar senha'}
              </Button>
            </form>

            {end && (
              <p style={{ margin: 'var(--space-4) 0 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
                Sua sessão atual vale até {end.toLocaleString('pt-BR')}. Depois disso é preciso entrar de novo.
              </p>
            )}
          </Card>
        </div>
      )}
    </AdminLayout>
  );
};

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STAFF_ROLES, UserRole } from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import { apiFetch, errorMessage } from '../../lib/api';
import { useSessionUser } from '../../lib/queries';
import { useDepartments } from '../../lib/queries';

const ROLE_LABELS: Record<string, string> = {
  [UserRole.TRIAGE]: 'Atendimento e triagem',
  [UserRole.DEPARTMENT]: 'Departamento responsável',
  [UserRole.MANAGER]: 'Gestor',
  [UserRole.ADMIN]: 'Administrador',
};

/** Cadastro de usuários de atendimento. Somente o Administrador chega aqui (e a API também exige o papel). */
export const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: departments = [] } = useDepartments();
  const users = useQuery<any[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/admin/users'),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.TRIAGE);
  const [departmentId, setDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const me = useSessionUser();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole(UserRole.TRIAGE);
    setDepartmentId('');
  };

  const startEdit = (u: any) => {
    setFeedback(null);
    setErrorMsg(null);
    setEditingId(u.id);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setDepartmentId(u.departmentId || '');
  };

  const toggleActive = async (u: any) => {
    setFeedback(null);
    setErrorMsg(null);
    try {
      await apiFetch(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active }),
      });
      setFeedback(
        u.active
          ? `${u.name} foi desativado e não consegue mais entrar.`
          : `${u.name} foi reativado.`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Não foi possível alterar a situação do usuário.'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErrorMsg(null);
    setSaving(true);
    if (editingId) {
      try {
        const updated = await apiFetch(`/admin/users/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            role,
            departmentId: role === UserRole.DEPARTMENT ? departmentId || undefined : null,
          }),
        });
        setFeedback(`Dados de ${updated.name} atualizados.`);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      } catch (err) {
        setErrorMsg(errorMessage(err, 'Não foi possível salvar as alterações.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const created = await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          departmentId: role === UserRole.DEPARTMENT ? departmentId || undefined : undefined,
        }),
      });
      setFeedback(
        `Usuário ${created.name} criado. Repasse a senha inicial por um canal seguro; a pessoa pode trocá-la em "Esqueci a senha".`,
      );
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Não foi possível criar o usuário.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Usuários de atendimento</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Somente o Administrador cria, edita e desativa contas de atendimento. Cidadãos se cadastram sozinhos pelo aplicativo. Uma conta desativada não entra mais, e a sessão aberta deixa de renovar.
        </p>
      </div>

      {feedback && (
        <div style={{ marginBottom: 'var(--space-4)' }} role="status">
          <Notice variant="info">{feedback}</Notice>
        </div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="danger">{errorMsg}</Notice>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Card>
          <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
            {editingId ? 'Editar usuário' : 'Novo usuário'}
          </h2>
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0 var(--space-4)',
              alignItems: 'end',
            }}
          >
            <Field label="Nome completo" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="E-mail institucional" required>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  className="cf-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="servidor@cidadeemfoco.gov.br"
                  disabled={Boolean(editingId)}
                  required
                />
              )}
            </Field>
            <Field label="Perfil" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {role === UserRole.DEPARTMENT && (
              <Field label="Departamento" required>
                {(props) => (
                  <select
                    {...props}
                    className="cf-select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    required
                  >
                    <option value="">Selecione...</option>
                    {departments
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
            )}
            {!editingId && (
            <Field label="Senha inicial" hint="Mínimo de 8 caracteres" required>
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
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar usuário'}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
        </Card>

        <section aria-labelledby="users-heading">
          <h2 id="users-heading" className="h2" style={{ marginBottom: 'var(--space-3)' }}>
            Contas cadastradas
          </h2>
          {users.isLoading && <LoadingBlock label="Carregando usuários..." />}
          {users.error && <ErrorBlock error={users.error} onRetry={() => users.refetch()} />}
          {users.data && (
            <div className="cf-table-wrapper">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">E-mail</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        {ROLE_LABELS[u.role] || u.role}
                        {u.departmentName ? ` — ${u.departmentName}` : ''}
                      </td>
                      <td>
                        <span
                          className="cf-badge"
                          style={{
                            backgroundColor: u.active ? 'var(--status-done-bg)' : 'var(--status-rejected-bg)',
                            color: u.active ? 'var(--status-done-fg)' : 'var(--status-rejected-fg)',
                          }}
                        >
                          {u.active ? 'Ativa' : 'Desativada'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => startEdit(u)}
                            aria-label={`Editar ${u.name}`}
                            style={{ minHeight: 40, padding: '0 var(--space-3)' }}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={u.id === me?.id}
                            title={u.id === me?.id ? 'Você não pode desativar a própria conta' : undefined}
                            onClick={() => toggleActive(u)}
                            aria-label={`${u.active ? 'Desativar' : 'Reativar'} ${u.name}`}
                            style={{ minHeight: 40, padding: '0 var(--space-3)' }}
                          >
                            {u.active ? 'Desativar' : 'Reativar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
};

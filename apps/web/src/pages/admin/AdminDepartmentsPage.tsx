import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { CategoryIcon } from '../../components/CategoryIcons';
import { AdminLayout } from './AdminLayout';
import { apiFetch, errorMessage } from '../../lib/api';
import { CategoryItem, useDepartments, useSessionUser } from '../../lib/queries';

export const AdminDepartmentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const isAdmin = user?.role === UserRole.ADMIN;

  const deptQuery = useDepartments();
  const departments = deptQuery.data ?? [];

  const catQuery = useQuery<CategoryItem[]>({
    queryKey: ['admin-categories'],
    queryFn: () => apiFetch('/admin/categories'),
  });
  const categories = catQuery.data ?? [];
  const [saving, setSaving] = useState(false);

  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDeadline, setNewDeptDeadline] = useState(3);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleCategoryCheck = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);

    if (!newDeptName.trim()) {
      setErrorMsg('Informe o nome do departamento.');
      return;
    }

    setSaving(true);
    try {
      if (editingDeptId) {
        await apiFetch(`/admin/departments/${editingDeptId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: newDeptName.trim(),
            responseDeadlineDays: newDeptDeadline,
            categoryIds: selectedCategoryIds,
          }),
        });
        setFeedback('Departamento atualizado e registrado em auditoria.');
      } else {
        await apiFetch('/admin/departments', {
          method: 'POST',
          body: JSON.stringify({
            name: newDeptName.trim(),
            responseDeadlineDays: newDeptDeadline,
            categoryIds: selectedCategoryIds,
          }),
        });
        setFeedback('Novo departamento criado e registrado em auditoria.');
      }
      setNewDeptName('');
      setNewDeptDeadline(3);
      setSelectedCategoryIds([]);
      setEditingDeptId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Não foi possível salvar o departamento.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCategoryActive = async (cat: any, active: boolean) => {
    setErrorMsg(null);
    setFeedback(null);
    try {
      await apiFetch(`/admin/categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setFeedback(
        `Categoria "${cat.name}" ${active ? 'ativada' : 'desativada'} e registrada em auditoria.`,
      );
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Não foi possível atualizar a categoria.'));
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Departamentos e categorias</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Configuração de roteamento automático, prazos de resposta e execução (edição restrita ao perfil Administrador)
        </p>
      </div>

      {!isAdmin && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="warning">
            Modo somente leitura: apenas o perfil Administrador pode criar ou editar departamentos e categorias.
          </Notice>
        </div>
      )}

      {feedback && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="info">{feedback}</Notice>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="danger">{errorMsg}</Notice>
        </div>
      )}

      {(deptQuery.isLoading || catQuery.isLoading) && (
        <LoadingBlock label="Carregando departamentos e categorias..." />
      )}
      {(deptQuery.error || catQuery.error) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorBlock
            error={deptQuery.error || catQuery.error}
            onRetry={() => {
              deptQuery.refetch();
              catQuery.refetch();
            }}
          />
        </div>
      )}

      {/* Duas Colunas: Esquerda (Tabela Departamentos + Tabela Categorias) | Direita (Formulário Novo Departamento) */}
      <div
        className="r-grid"
        style={{ '--cols': 'minmax(0, 1.45fr) minmax(0, 1fr)', gap: 'var(--space-5)' } as React.CSSProperties}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Tabela Departamentos */}
          <section aria-labelledby="depts-table-heading">
            <h2 id="depts-table-heading" className="h2" style={{ marginBottom: 'var(--space-3)' }}>
              Departamentos
            </h2>
            <div className="cf-table-wrapper">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Categorias atendidas</th>
                    <th scope="col">Prazo de resposta (dias)</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept: any) => (
                    <tr key={dept.id}>
                      <td style={{ fontWeight: 700 }}>{dept.name}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(dept.categories || []).map((c: any) => (
                            <span
                              key={c.id || c.name}
                              className="cf-badge"
                              style={{
                                backgroundColor: 'var(--surface-300)',
                                color: 'var(--ink)',
                                fontSize: 12,
                              }}
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="mono">{dept.responseDeadlineDays} dias</td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!isAdmin}
                          onClick={() => {
                            setEditingDeptId(dept.id);
                            setNewDeptName(dept.name);
                            setNewDeptDeadline(dept.responseDeadlineDays);
                            setSelectedCategoryIds(
                              (dept.categories || []).map((c: any) => c.id),
                            );
                          }}
                          style={{ minHeight: 40, padding: '0 var(--space-3)' }}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tabela Categorias */}
          <section aria-labelledby="cats-table-heading">
            <h2 id="cats-table-heading" className="h2" style={{ marginBottom: 'var(--space-3)' }}>
              Categorias
            </h2>
            <div className="cf-table-wrapper">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th scope="col">Ícone e nome</th>
                    <th scope="col">Departamento responsável</th>
                    <th scope="col">Prazo de execução (dias)</th>
                    <th scope="col">Ativa</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat: any) => (
                    <tr key={cat.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
                          <CategoryIcon icon={cat.icon} slug={cat.slug} size={18} />
                          <span>{cat.name}</span>
                        </div>
                      </td>
                      <td>{cat.departmentName}</td>
                      <td className="mono">{cat.executionDeadlineDays} dias</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={cat.active !== false}
                          disabled={!isAdmin}
                          aria-label={`Categoria ${cat.name} ativa`}
                          onChange={(e) =>
                            handleToggleCategoryActive(cat, e.target.checked)
                          }
                          style={{ width: 20, height: 20, cursor: 'pointer' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Ao lado: Formulário "Novo departamento" */}
        <Card style={{ position: 'sticky', top: 'var(--space-5)' }}>
          <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
            {editingDeptId ? 'Editar departamento' : 'Novo departamento'}
          </h2>

          <form onSubmit={handleSaveDepartment}>
            <Field label="Nome do departamento" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Ex.: Secretaria de Mobilidade Urbana"
                  disabled={!isAdmin}
                  required
                />
              )}
            </Field>

            <div className="cf-field">
              <span className="cf-label">Categorias atendidas</span>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--surface-300)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {categories.map((cat: any) => {
                  const checkboxId = `dept-cat-${cat.id}`;
                  return (
                    <label
                      key={cat.id}
                      htmlFor={checkboxId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--fs-small)',
                        cursor: isAdmin ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={selectedCategoryIds.includes(cat.id)}
                        disabled={!isAdmin}
                        onChange={() => toggleCategoryCheck(cat.id)}
                        style={{ width: 18, height: 18 }}
                      />
                      <span>{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Field label="Prazo de resposta em dias (padrão 3)" required>
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min={1}
                  max={30}
                  className="cf-input mono"
                  value={newDeptDeadline}
                  onChange={(e) => setNewDeptDeadline(Number(e.target.value))}
                  disabled={!isAdmin}
                  required
                />
              )}
            </Field>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={!isAdmin || saving}
              >
                {saving ? 'Salvando...' : 'Salvar departamento'}
              </Button>
              {editingDeptId && (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setEditingDeptId(null);
                    setNewDeptName('');
                    setNewDeptDeadline(3);
                    setSelectedCategoryIds([]);
                  }}
                >
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </AdminLayout>
  );
};

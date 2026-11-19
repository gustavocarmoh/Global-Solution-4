import React, { useId } from 'react';
import {
  AlertCircle,
  Info,
  AlertTriangle,
  Star,
  MapPin,
  FileText,
  LayoutDashboard,
  BarChart3,
  Building2,
  Users,
  Clock,
  ScrollText,
  UserCog,
  LogOut,
  Target,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

/* 1. Button (primary, secondary, ghost; min-height 48px) */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      className={`cf-btn cf-btn-${variant} ${className}`}
      style={fullWidth ? { width: '100%' } : undefined}
      {...props}
    >
      {children}
    </button>
  );
};

/* 2. Field (input, select, textarea; rótulo sempre visível acima e erro com aria-describedby) */
interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  error,
  hint,
  required,
  children,
}) => {
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const hintId = `${generatedId}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="cf-field">
      <label htmlFor={generatedId} className="cf-label">
        {label} {required && <span aria-hidden="true">*</span>}
      </label>
      {hint && (
        <span
          id={hintId}
          style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}
        >
          {hint}
        </span>
      )}
      {children({
        id: generatedId,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {error && (
        <div id={errorId} className="cf-field-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

/* 3. Chip (filtros, altura mínima 44px) */
interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Chip: React.FC<ChipProps> = ({
  active = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`cf-chip ${active ? 'cf-chip-active' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/* 4. Card */
export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'section' | 'article' }
> = ({ as: Component = 'div', className = '', children, ...props }) => {
  return (
    <Component className={`cf-card ${className}`} {...props}>
      {children}
    </Component>
  );
};

/* 5. Notice (informação, alerta de emergência e erro) */
interface NoticeProps {
  variant?: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}

export const Notice: React.FC<NoticeProps> = ({
  variant = 'info',
  children,
}) => {
  const icon =
    variant === 'warning' ? (
      <AlertTriangle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
    ) : variant === 'danger' ? (
      <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
    ) : (
      <Info size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
    );

  return (
    <div
      className={`cf-notice cf-notice-${variant}`}
      role={variant === 'danger' ? 'alert' : 'note'}
    >
      {icon}
      <div>{children}</div>
    </div>
  );
};

/* Estados de carregamento, erro e lista vazia para dados vindos da API */
export const LoadingBlock: React.FC<{ label?: string }> = ({
  label = 'Carregando...',
}) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      padding: 'var(--space-5)',
      textAlign: 'center',
      color: 'var(--ink-muted)',
      fontSize: 'var(--fs-small)',
    }}
  >
    {label}
  </div>
);

export const ErrorBlock: React.FC<{
  error: unknown;
  onRetry?: () => void;
  fallback?: string;
}> = ({ error, onRetry, fallback = 'Não foi possível carregar os dados.' }) => (
  <Notice variant="danger">
    <div>{error instanceof Error && error.message ? error.message : fallback}</div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="cf-btn cf-btn-secondary"
        style={{ minHeight: 44, marginTop: 'var(--space-2)' }}
      >
        Tentar novamente
      </button>
    )}
  </Notice>
);

export const EmptyBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      padding: 'var(--space-5)',
      textAlign: 'center',
      color: 'var(--ink-muted)',
      fontSize: 'var(--fs-small)',
    }}
  >
    {children}
  </div>
);

/* Paginação (Anterior/Próxima) com contagem */
export const Pager: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  noun?: string;
}> = ({ page, pageSize, total, onChange, noun = 'registros' }) => {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        marginTop: 'var(--space-4)',
      }}
    >
      <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
        {total === 0
          ? `Nenhum registro`
          : `${start} a ${end} de ${total.toLocaleString('pt-BR')} ${noun}`}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          style={{ minHeight: 44 }}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={end >= total}
          onClick={() => onChange(page + 1)}
          style={{ minHeight: 44 }}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
};

/* Aviso Obrigatório de Emergência (Regra Inegociável Seção 2) */
export const EmergencyBanner: React.FC = () => (
  <Notice variant="warning">
    <strong>Esta plataforma não é canal de emergência.</strong> Em emergência,
    ligue <strong>190</strong>, <strong>192</strong> ou <strong>193</strong>.
  </Notice>
);

/* 6. Stepper (4 passos de registro) */
interface StepperProps {
  currentStep: number;
  steps: string[];
}

export const Stepper: React.FC<StepperProps> = ({ currentStep, steps }) => {
  return (
    <nav aria-label="Progresso do registro" style={{ marginBottom: 'var(--space-4)' }}>
      <ol
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
          gap: 'var(--space-2)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {steps.map((label, index) => {
          const stepNum = index + 1;
          const isCurrent = stepNum === currentStep;
          const isDone = stepNum < currentStep;
          return (
            <li
              key={label}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div
                style={{
                  height: 6,
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor:
                    isCurrent || isDone ? 'var(--brand)' : 'var(--line)',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? 'var(--brand)' : 'var(--ink-muted)',
                }}
              >
                {stepNum}. {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/* 7. Stars (1 a 5 estrelas acessíveis por teclado e toque >= 44px) */
interface StarsProps {
  value: number;
  onChange?: (stars: number) => void;
  readOnly?: boolean;
}

export const Stars: React.FC<StarsProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  return (
    <div
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={
        readOnly
          ? `Avaliação: ${value} de 5 estrelas`
          : 'Selecione de 1 a 5 estrelas para avaliar o atendimento'
      }
      style={{ display: 'inline-flex', gap: 'var(--space-1)' }}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        if (readOnly) {
          return (
            <Star
              key={star}
              size={22}
              fill={filled ? 'var(--sun)' : 'transparent'}
              color={filled ? '#8a5200' : 'var(--line-strong)'}
              aria-hidden="true"
            />
          );
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
            onClick={() => onChange?.(star)}
            style={{
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            <Star
              size={24}
              fill={filled ? 'var(--sun)' : 'transparent'}
              color={filled ? '#1b2420' : 'var(--line-strong)'}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
};

/* 9. Sidebar Administrativa (Desktop, 7 itens conforme Seção 8) */
interface AdminSidebarProps {
  id?: string;
  /** Exibe o item "Usuários" (cadastro de atendimento), exclusivo do Administrador. */
  isAdmin?: boolean;
  userName?: string;
  userRoleLabel?: string;
  onLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  id,
  isAdmin = false,
  userName,
  userRoleLabel,
  onLogout,
}) => {
  const navItemStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    minHeight: 44,
    padding: '0 var(--space-4)',
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    fontWeight: 600,
    backgroundColor: isActive ? 'var(--brand-soft)' : 'transparent',
    color: isActive ? 'var(--brand)' : 'var(--ink)',
  });

  return (
    <aside id={id} className="admin-sidebar">
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--brand)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Target size={20} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Cidade em Foco
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Gestão Municipal
            </div>
          </div>
        </div>

        <nav aria-label="Menu administrativo" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink to="/admin" end style={navItemStyle}>
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/admin/solicitacoes" style={navItemStyle}>
            <FileText size={18} aria-hidden="true" />
            <span>Solicitações</span>
          </NavLink>
          <NavLink to="/admin/prazos" style={navItemStyle}>
            <Clock size={18} aria-hidden="true" />
            <span>Prazos</span>
          </NavLink>
          <NavLink to="/admin/mapa" style={navItemStyle}>
            <MapPin size={18} aria-hidden="true" />
            <span>Mapa</span>
          </NavLink>
          <NavLink to="/admin/avaliacoes" style={navItemStyle}>
            <Star size={18} aria-hidden="true" />
            <span>Avaliações</span>
          </NavLink>
          <NavLink to="/admin/relatorios" style={navItemStyle}>
            <BarChart3 size={18} aria-hidden="true" />
            <span>Relatórios</span>
          </NavLink>
          <NavLink to="/admin/departamentos" style={navItemStyle}>
            <Building2 size={18} aria-hidden="true" />
            <span>Departamentos</span>
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin/usuarios" style={navItemStyle}>
                <Users size={18} aria-hidden="true" />
                <span>Usuários</span>
              </NavLink>
              <NavLink to="/admin/auditoria" style={navItemStyle}>
                <ScrollText size={18} aria-hidden="true" />
                <span>Auditoria</span>
              </NavLink>
            </>
          )}
          <NavLink to="/admin/conta" style={navItemStyle}>
            <UserCog size={18} aria-hidden="true" />
            <span>Minha conta</span>
          </NavLink>
        </nav>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--space-3)' }}>
        {userName && (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>{userName}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{userRoleLabel}</div>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="cf-btn cf-btn-secondary"
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
};

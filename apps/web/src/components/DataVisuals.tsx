import React, { useState } from 'react';
import { OccurrenceStatus } from '@cidade-em-foco/shared';
import { StatusBadge } from './Badges';
import { Button } from './DesignSystem';

/* 10. Timeline (Linha do tempo vertical de estados, com data, hora, responsável e justificativa) */
export interface TimelineItemData {
  id: string;
  toStatus: OccurrenceStatus;
  justification?: string | null;
  actorName?: string | null;
  createdAt: string;
}

interface TimelineProps {
  items: TimelineItemData[];
}

export const Timeline: React.FC<TimelineProps> = ({ items }) => {
  return (
    <ol
      aria-label="Histórico de andamento da solicitação"
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const formattedDate = new Date(item.createdAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <li
            key={item.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr',
              gap: 'var(--space-3)',
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: isLast ? 'var(--brand)' : 'var(--line-strong)',
                  marginTop: 6,
                }}
              />
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    backgroundColor: 'var(--line)',
                    marginTop: 4,
                  }}
                />
              )}
            </div>

            <div style={{ paddingBottom: 'var(--space-2)' }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginBottom: 4,
                }}
              >
                <StatusBadge status={item.toStatus} />
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                  {formattedDate}
                </span>
              </div>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
                Responsável: <strong>{item.actorName || 'Sistema Municipal'}</strong>
              </div>
              {item.justification && (
                <div
                  style={{
                    marginTop: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--surface-300)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--fs-small)',
                  }}
                >
                  {item.justification}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/* 11. BarList (Gráfico de barras horizontais com tabela equivalente acessível) */
export interface BarListItem {
  label: string;
  value: number;
  icon?: React.ReactNode;
}

interface BarListProps {
  title: string;
  items: BarListItem[];
  unitLabel?: string;
}

export const BarList: React.FC<BarListProps> = ({
  title,
  items,
  unitLabel = 'Solicitações',
}) => {
  const [showTable, setShowTable] = useState(false);
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="cf-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h2 className="h3">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowTable((prev) => !prev)}
          style={{ minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--fs-small)' }}
        >
          {showTable ? 'Ver gráfico' : 'Ver dados em tabela'}
        </Button>
      </div>

      {!showTable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-hidden="true">
          {items.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            return (
              <div key={item.label}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                    fontSize: 'var(--fs-small)',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {item.icon}
                    {item.label}
                  </span>
                  <span className="mono">{item.value.toLocaleString('pt-BR')}</span>
                </div>
                <div
                  style={{
                    height: 10,
                    backgroundColor: 'var(--surface-300)',
                    borderRadius: 'var(--radius-pill)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: 'var(--brand)',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabela sempre disponível para leitores de tela, ou visível quando solicitada */}
      <div className={showTable ? 'cf-table-wrapper' : 'sr-only'}>
        <table className="cf-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">{unitLabel}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.label}>
                <td>{item.label}</td>
                <td className="mono">{item.value.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* 12. ColumnChart (Gráfico de colunas agrupadas Registradas x Solucionadas com tabela equivalente) */
export interface MonthlySeriesItem {
  month: string;
  registered: number;
  resolved: number;
}

interface ColumnChartProps {
  title: string;
  series: MonthlySeriesItem[];
}

export const ColumnChart: React.FC<ColumnChartProps> = ({ title, series }) => {
  const [showTable, setShowTable] = useState(false);
  const maxVal = Math.max(
    ...series.flatMap((s) => [s.registered, s.resolved]),
    1,
  );

  return (
    <div className="cf-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <h2 className="h3">{title}</h2>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              fontSize: 12,
              color: 'var(--ink-muted)',
              marginTop: 4,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: 'var(--brand)',
                }}
              />
              Registradas
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: 'var(--focus-ring)',
                }}
              />
              Solucionadas
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowTable((prev) => !prev)}
          style={{ minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--fs-small)' }}
        >
          {showTable ? 'Ver gráfico' : 'Ver dados em tabela'}
        </Button>
      </div>

      {!showTable && (
        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${series.length}, 1fr)`,
            gap: 'var(--space-2)',
            alignItems: 'end',
            height: 200,
            paddingTop: 'var(--space-4)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {series.map((item) => {
            const regHeight = Math.round((item.registered / maxVal) * 140);
            const resHeight = Math.round((item.resolved / maxVal) * 140);
            return (
              <div
                key={item.month}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 4,
                    height: 145,
                    width: '100%',
                  }}
                >
                  <div
                    title={`Registradas: ${item.registered}`}
                    style={{
                      flex: '1 1 0',
                      maxWidth: 18,
                      minWidth: 4,
                      height: `${regHeight}px`,
                      backgroundColor: 'var(--brand)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <div
                    title={`Solucionadas: ${item.resolved}`}
                    style={{
                      flex: '1 1 0',
                      maxWidth: 18,
                      minWidth: 4,
                      height: `${resHeight}px`,
                      backgroundColor: 'var(--focus-ring)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere', textAlign: 'center' }}>
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className={showTable ? 'cf-table-wrapper' : 'sr-only'}>
        <table className="cf-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Registradas</th>
              <th scope="col">Solucionadas</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.month}>
                <td>{item.month}</td>
                <td className="mono">{item.registered.toLocaleString('pt-BR')}</td>
                <td className="mono">{item.resolved.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

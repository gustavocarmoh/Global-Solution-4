import React from 'react';
import {
  Inbox,
  Search,
  ArrowRightCircle,
  Calendar,
  Settings,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ArrowDownCircle,
} from 'lucide-react';
import {
  OccurrencePriority,
  OCCURRENCE_PRIORITY_LABELS,
  OccurrenceStatus,
  OCCURRENCE_STATUS_LABELS,
} from '@cidade-em-foco/shared';

interface StatusBadgeProps {
  status: OccurrenceStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config: Record<
    OccurrenceStatus,
    { fg: string; bg: string; icon: React.ReactNode }
  > = {
    [OccurrenceStatus.RECEIVED]: {
      fg: 'var(--status-received-fg)',
      bg: 'var(--status-received-bg)',
      icon: <Inbox size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.IN_REVIEW]: {
      fg: 'var(--status-review-fg)',
      bg: 'var(--status-review-bg)',
      icon: <Search size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.FORWARDED]: {
      fg: 'var(--status-review-fg)',
      bg: 'var(--status-review-bg)',
      icon: <ArrowRightCircle size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.SCHEDULED]: {
      fg: 'var(--status-progress-fg)',
      bg: 'var(--status-progress-bg)',
      icon: <Calendar size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.IN_PROGRESS]: {
      fg: 'var(--status-progress-fg)',
      bg: 'var(--status-progress-bg)',
      icon: <Settings size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.DONE]: {
      fg: 'var(--status-done-fg)',
      bg: 'var(--status-done-bg)',
      icon: <CheckCircle2 size={15} aria-hidden="true" />,
    },
    [OccurrenceStatus.REJECTED]: {
      fg: 'var(--status-rejected-fg)',
      bg: 'var(--status-rejected-bg)',
      icon: <XCircle size={15} aria-hidden="true" />,
    },
  };

  const current = config[status] || config[OccurrenceStatus.RECEIVED];
  const label = OCCURRENCE_STATUS_LABELS[status] || status;

  return (
    <span
      className="cf-badge"
      style={{ color: current.fg, backgroundColor: current.bg }}
      aria-label={`Estado: ${label}`}
    >
      {current.icon}
      <span>{label}</span>
    </span>
  );
};

interface PriorityBadgeProps {
  priority: OccurrencePriority;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const config: Record<
    OccurrencePriority,
    { fg: string; bg: string; icon: React.ReactNode }
  > = {
    [OccurrencePriority.HIGH]: {
      fg: 'var(--status-rejected-fg)',
      bg: 'var(--status-rejected-bg)',
      icon: <AlertTriangle size={14} aria-hidden="true" />,
    },
    [OccurrencePriority.MEDIUM]: {
      fg: 'var(--status-progress-fg)',
      bg: 'var(--status-progress-bg)',
      icon: <MinusCircle size={14} aria-hidden="true" />,
    },
    [OccurrencePriority.LOW]: {
      fg: 'var(--status-received-fg)',
      bg: 'var(--status-received-bg)',
      icon: <ArrowDownCircle size={14} aria-hidden="true" />,
    },
  };

  const current = config[priority] || config[OccurrencePriority.MEDIUM];
  const label = OCCURRENCE_PRIORITY_LABELS[priority] || priority;

  return (
    <span
      className="cf-badge"
      style={{ color: current.fg, backgroundColor: current.bg }}
      aria-label={`Prioridade: ${label}`}
    >
      {current.icon}
      <span>{label}</span>
    </span>
  );
};

import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusTone;
};

export const StatusBadge = ({
  children,
  tone = 'neutral'
}: StatusBadgeProps) => (
  <span className="status-badge" data-tone={tone}>
    <span className="status-badge__dot" aria-hidden="true" />
    {children}
  </span>
);

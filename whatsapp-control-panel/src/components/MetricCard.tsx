import type { ReactNode } from 'react';

type MetricCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge?: ReactNode;
  children?: ReactNode;
};

export const MetricCard = ({
  eyebrow,
  title,
  description,
  badge,
  children
}: MetricCardProps) => (
  <article className="metric-card">
    <div className="metric-card__header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {badge}
    </div>
    <p className="metric-card__description">{description}</p>
    {children}
  </article>
);

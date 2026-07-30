import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders its label and semantic tone', () => {
    render(<StatusBadge tone="success">Connected</StatusBadge>);

    expect(screen.getByText('Connected')).toHaveAttribute('data-tone', 'success');
  });
});

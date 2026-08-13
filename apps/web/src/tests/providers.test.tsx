import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '../app/providers';

function Consumer() {
  const client = useQueryClient();
  return <span>{String(client.getDefaultOptions().queries?.retry)}</span>;
}

describe('AppProviders', () => {
  it('provides the configured query client', () => {
    render(
      <AppProviders>
        <Consumer />
      </AppProviders>,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

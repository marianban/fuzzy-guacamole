import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render-app';
import { Shell } from './shell';

describe('Shell', () => {
  it('given page content when rendered then it contains only the header and main app area', () => {
    renderApp(
      <Shell>
        <div>Page content</div>
      </Shell>
    );

    const main = screen.getByRole('main');

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(main).toHaveTextContent('Page content');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(main.parentElement?.children).toHaveLength(2);
  });
});

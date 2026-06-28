import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { ComfyDeckTheme } from '../../styles/comfy-deck-theme';
import { Accordion, type AccordionProps } from './accordion';

function renderAccordion(ui: React.ReactElement) {
  return render(<ComfyDeckTheme>{ui}</ComfyDeckTheme>);
}

describe('Accordion', () => {
  it('given accordion props when typed then single and multiple values are supported', () => {
    expectTypeOf<AccordionProps['defaultValue']>().toEqualTypeOf<
      string | string[] | null | undefined
    >();
    expectTypeOf<AccordionProps['items'][number]['value']>().toEqualTypeOf<string>();
  });

  it('given closed items when rendered then it exposes every item as a button', () => {
    renderAccordion(
      <Accordion
        items={[
          { value: 'advanced', label: 'Advanced Parameters', content: 'Advanced fields' },
          { value: 'logs', label: 'Logs', content: 'Generation log' }
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Advanced Parameters' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Logs' })).toBeInTheDocument();
  });

  it('given an item when the user opens and closes it then the panel and chevron state update', async () => {
    const user = userEvent.setup();

    renderAccordion(
      <Accordion
        items={[
          { value: 'advanced', label: 'Advanced Parameters', content: 'Advanced fields' }
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Advanced Parameters' });

    expect(screen.getByTestId('accordion-chevron-down')).toBeInTheDocument();
    expect(screen.queryByText('Advanced fields')).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('accordion-chevron-up')).toBeInTheDocument();
    expect(screen.getByText('Advanced fields')).toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('accordion-chevron-down')).toBeInTheDocument();
    expect(screen.queryByText('Advanced fields')).not.toBeInTheDocument();
  });

  it('given multiple mode when rendered then more than one item can stay open', async () => {
    const user = userEvent.setup();

    renderAccordion(
      <Accordion
        multiple
        items={[
          { value: 'advanced', label: 'Advanced Parameters', content: 'Advanced fields' },
          { value: 'logs', label: 'Logs', content: 'Generation log' }
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Advanced Parameters' }));
    await user.click(screen.getByRole('button', { name: 'Logs' }));

    expect(screen.getByText('Advanced fields')).toBeInTheDocument();
    expect(screen.getByText('Generation log')).toBeInTheDocument();
  });
});

import type { PropsWithChildren } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';

const comfyDeckMantineTheme = createTheme({
  primaryColor: 'lime',
  primaryShade: 4,
  defaultRadius: 'xs',
  fontFamily: 'var(--font-family-interface)',
  fontFamilyMonospace: 'var(--font-family-mono)',
  fontSizes: {
    xs: 'var(--font-size-1)',
    sm: 'var(--font-size-2)',
    md: 'var(--font-size-3)',
    lg: 'var(--font-size-4)',
    xl: 'var(--font-size-5)'
  },
  spacing: {
    xs: 'var(--space-1)',
    sm: 'var(--space-2)',
    md: 'var(--space-3)',
    lg: 'var(--space-4)',
    xl: 'var(--space-5)'
  },
  radius: {
    xs: 'var(--radius-control)',
    sm: 'var(--radius-container)',
    md: 'var(--radius-container)',
    lg: 'var(--radius-full)',
    xl: 'var(--radius-full)'
  },
  colors: {
    lime: [
      '#d4ff70',
      '#d4ff70',
      '#bde56c',
      '#bdee63',
      '#bdee63',
      '#577538',
      '#496231',
      '#3d522a',
      '#334423',
      '#29371d'
    ],
    olive: [
      '#577538',
      '#496231',
      '#3d522a',
      '#334423',
      '#29371d',
      '#1f2917',
      '#151a10',
      '#11130c',
      '#11130c',
      '#11130c'
    ]
  }
});

export function ComfyDeckTheme({ children }: PropsWithChildren) {
  return (
    <MantineProvider defaultColorScheme="dark" theme={comfyDeckMantineTheme}>
      {children}
    </MantineProvider>
  );
}

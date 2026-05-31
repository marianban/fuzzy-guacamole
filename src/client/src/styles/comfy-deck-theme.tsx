import type { PropsWithChildren } from 'react';
import { Theme } from '@radix-ui/themes';

export function ComfyDeckTheme({ children }: PropsWithChildren) {
  return (
    <Theme
      appearance="dark"
      accentColor="lime"
      grayColor="olive"
      panelBackground="solid"
      radius="small"
      scaling="95%"
    >
      {children}
    </Theme>
  );
}

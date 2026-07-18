import {
  Button as MantineButton,
  type ButtonProps as MantineButtonProps
} from '@mantine/core';
import clsx from 'clsx';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import styles from './button.module.css';

const actionButtonBackground =
  'linear-gradient(180deg, var(--color-surface-action-start) 0%, var(--color-surface-action-end) 100%), var(--color-background-panel)';

export interface ButtonProps extends MantineButtonProps {
  onClick?: ComponentPropsWithoutRef<'button'>['onClick'];
}

/**
 * A themed action button built on Mantine's Button primitive.
 */
export const Button = forwardRef<ElementRef<'button'>, ButtonProps>(
  (
    { className, disabled, radius = 'xs', size = 'md', variant = 'filled', ...props },
    ref
  ) => {
    const isUnstyled = variant === 'unstyled';
    const buttonLabelClassName = styles.label ?? '';
    const buttonRootClassName = styles.button ?? '';
    const buttonSectionClassName = styles.section ?? '';

    return (
      <MantineButton
        {...props}
        ref={ref}
        className={clsx(styles.root, className)}
        classNames={
          isUnstyled
            ? {
                label: buttonLabelClassName
              }
            : {
                label: buttonLabelClassName,
                root: buttonRootClassName,
                section: buttonSectionClassName
              }
        }
        radius={radius}
        size={size}
        vars={
          isUnstyled
            ? undefined
            : () => ({
                root: {
                  '--button-bg': disabled
                    ? 'var(--color-background-panel)'
                    : actionButtonBackground,
                  '--button-bd': disabled
                    ? '1px solid var(--color-border-subtle)'
                    : '1px solid var(--color-accent-a10)',
                  '--button-color': disabled
                    ? 'var(--color-text-muted)'
                    : 'var(--color-interactive-accent)',
                  '--button-hover-color': disabled
                    ? 'var(--color-text-muted)'
                    : 'var(--color-accent-strong)'
                }
              })
        }
        variant={variant}
        disabled={disabled}
      />
    );
  }
);

Button.displayName = 'Button';

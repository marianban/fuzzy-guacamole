import {
  Button as MantineButton,
  type ButtonProps as MantineButtonProps
} from '@mantine/core';
import clsx from 'clsx';
import { forwardRef, type ElementRef } from 'react';

import styles from './button.module.css';
import { omitUndefined } from '../../utils/object';

export interface ButtonProps extends Omit<MantineButtonProps, 'className'> {
  className?: string;
}

/**
 * A themed action button built on Mantine's Button primitive.
 */
export const Button = forwardRef<ElementRef<'button'>, ButtonProps>(
  ({ className, radius = 'xs', size = 'md', variant = 'filled', ...props }, ref) => (
    <MantineButton
      {...props}
      ref={ref}
      className={clsx(styles.root, className)}
      classNames={omitUndefined({
        label: styles.label,
        root: styles.button,
        section: styles.section
      })}
      radius={radius}
      size={size}
      variant={variant}
    />
  )
);

Button.displayName = 'Button';

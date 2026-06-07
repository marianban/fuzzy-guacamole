import {
  Button as MantineButton,
  type ButtonProps as MantineButtonProps
} from '@mantine/core';
import clsx from 'clsx';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import styles from './button.module.css';

export interface ButtonProps extends Omit<MantineButtonProps, 'className'> {
  className?: string;
  onClick?: ComponentPropsWithoutRef<'button'>['onClick'];
}

/**
 * A themed action button built on Mantine's Button primitive.
 */
export const Button = forwardRef<ElementRef<'button'>, ButtonProps>(
  ({ className, radius = 'xs', size = 'md', variant = 'filled', ...props }, ref) => {
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
        variant={variant}
      />
    );
  }
);

Button.displayName = 'Button';

import {
  Textarea as MantineTextarea,
  type TextareaProps as MantineTextareaProps
} from '@mantine/core';
import clsx from 'clsx';
import { forwardRef, type ElementRef } from 'react';

import styles from './text-area.module.css';

export interface TextAreaProps extends Omit<
  MantineTextareaProps,
  'className' | 'defaultValue' | 'value'
> {
  className?: string;
  defaultValue?: string;
  value?: string;
}

/**
 * A themed multiline text input for longer user-authored values.
 */
export const TextArea = forwardRef<ElementRef<'textarea'>, TextAreaProps>(
  ({ className, ...props }, ref) => (
    <MantineTextarea
      {...props}
      ref={ref}
      autosize={false}
      className={clsx(styles.root, className)}
      classNames={{
        input: clsx(styles.input)
      }}
      radius="xs"
      resize="vertical"
      size="md"
      variant="unstyled"
    />
  )
);

TextArea.displayName = 'TextArea';

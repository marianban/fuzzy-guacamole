import {
  Input as MantineInput,
  type InputProps as MantineInputProps
} from '@mantine/core';
import clsx from 'clsx';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode
} from 'react';

import styles from './input.module.css';

type NativeInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  keyof MantineInputProps | 'className' | 'defaultValue' | 'id' | 'required' | 'value'
>;

export interface InputProps
  extends
    Omit<
      MantineInputProps,
      'className' | 'classNames' | 'defaultValue' | 'error' | 'id' | 'required' | 'value'
    >,
    NativeInputProps {
  className?: string;
  defaultValue?: ComponentPropsWithoutRef<'input'>['defaultValue'];
  description?: ReactNode;
  error?: ReactNode;
  id?: string;
  label?: ReactNode;
  required?: boolean;
  value?: ComponentPropsWithoutRef<'input'>['value'];
  withAsterisk?: boolean;
}

/**
 * A themed single-line input built from Mantine's Input and Input.Wrapper.
 */
export const Input = forwardRef<ElementRef<'input'>, InputProps>(
  (
    {
      className,
      description,
      error,
      id,
      label,
      required = false,
      withAsterisk,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <MantineInput.Wrapper
        className={clsx(styles.root, className)}
        classNames={{
          description: styles.description,
          error: styles.error,
          label: styles.label
        }}
        description={description}
        error={error}
        id={inputId}
        label={label}
        required={required}
        withAsterisk={withAsterisk ?? required}
      >
        <MantineInput
          {...props}
          ref={ref}
          classNames={{
            input: styles.input,
            section: styles.section,
            wrapper: styles.wrapper
          }}
          error={Boolean(error)}
          id={inputId}
          required={required}
          radius="xs"
          size="md"
          variant="unstyled"
        />
      </MantineInput.Wrapper>
    );
  }
);

Input.displayName = 'Input';

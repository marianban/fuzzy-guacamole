import {
  SegmentedControl as MantineSegmentedControl,
  type SegmentedControlProps as MantineSegmentedControlProps,
  type SegmentedControlStylesNames,
  InputWrapper as MantineInputWrapper,
  type InputWrapperStylesNames
} from '@mantine/core';
import clsx from 'clsx';

import styles from './button-bar.module.css';
import { omitUndefined } from '../../utils/object';

const buttonBarClassNames: Partial<Record<SegmentedControlStylesNames, string>> =
  omitUndefined({
    control: styles.control,
    indicator: styles.indicator,
    input: styles.input,
    label: styles.label,
    root: styles.segmentedRoot
  });

const inputWrapperClassNames: Partial<Record<InputWrapperStylesNames, string>> =
  omitUndefined({
    label: styles.inputWrapperLabel
  });

export interface ButtonBarProps<Value extends string = string> extends Omit<
  MantineSegmentedControlProps<Value>,
  'className'
> {
  className?: string;
  label?: string;
}

export function ButtonBar<Value extends string = string>({
  className,
  transitionDuration = 120,
  withItemsBorders = false,
  fullWidth = true,
  radius = 'xs',
  label,
  ...props
}: ButtonBarProps<Value>) {
  return (
    <MantineInputWrapper label={label} classNames={inputWrapperClassNames}>
      <MantineSegmentedControl
        {...props}
        autoContrast={false}
        className={clsx(styles.root, className)}
        classNames={buttonBarClassNames}
        fullWidth={fullWidth}
        radius={radius}
        transitionDuration={transitionDuration}
        withItemsBorders={withItemsBorders}
      />
    </MantineInputWrapper>
  );
}

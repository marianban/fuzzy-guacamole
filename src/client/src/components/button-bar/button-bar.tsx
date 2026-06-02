import {
  SegmentedControl as MantineSegmentedControl,
  type SegmentedControlProps as MantineSegmentedControlProps,
  type SegmentedControlStylesNames
} from '@mantine/core';
import clsx from 'clsx';

import styles from './button-bar.module.css';

const buttonBarClassNames: Partial<Record<SegmentedControlStylesNames, string>> = {
  control: styles.control ?? '',
  indicator: styles.indicator ?? '',
  input: styles.input ?? '',
  label: styles.label ?? '',
  root: styles.segmentedRoot ?? ''
};

export interface ButtonBarProps<Value extends string = string> extends Omit<
  MantineSegmentedControlProps<Value>,
  'className'
> {
  className?: string;
}

/**
 * A compact segmented button bar for small mutually exclusive choices.
 */
export function ButtonBar<Value extends string = string>({
  className,
  transitionDuration = 120,
  withItemsBorders = false,
  fullWidth = true,
  radius = 'xs',
  ...props
}: ButtonBarProps<Value>) {
  return (
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
  );
}

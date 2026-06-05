import {
  Slider as MantineSlider,
  type SliderStylesNames as MantineSliderStylesNames,
  type SliderProps as MantineSliderProps
} from '@mantine/core';
import clsx from 'clsx';
import styles from './slider.module.css';
import { omitUndefined } from '../../utils/object';

const THUMB_SIZE = 12;

const sliderClassNames: Partial<Record<MantineSliderStylesNames, string>> = omitUndefined(
  {
    bar: styles.bar,
    root: styles.sliderRoot,
    thumb: styles.thumb,
    track: styles.track,
    trackContainer: styles.trackContainer
  }
);

export interface SliderProps extends Omit<
  MantineSliderProps,
  'className' | 'defaultValue' | 'label' | 'onChange' | 'value'
> {
  className?: string;
  label?: string;
  onChange?: (value: number) => void;
  showValue?: boolean;
  value: number;
  valueFormatter?: (value: number) => string;
}

export function Slider({
  className,
  disabled = false,
  label,
  max,
  min = 0,
  onChange,
  showValue = true,
  step = 1,
  thumbLabel,
  value,
  valueFormatter = String,
  'aria-label': ariaLabel,
  ...props
}: SliderProps) {
  function handleChange(nextValue: number) {
    onChange?.(nextValue);
  }

  const sliderLabel = thumbLabel ?? ariaLabel ?? label;

  return (
    <div className={clsx(styles.root, className)}>
      {(label ?? showValue) && (
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
          {showValue ? (
            <span className={styles.value}>{valueFormatter(value)}</span>
          ) : null}
        </div>
      )}

      <MantineSlider
        {...props}
        classNames={sliderClassNames}
        color="lime.4"
        disabled={disabled}
        label={null}
        {...(max !== undefined ? { max } : {})}
        min={min}
        onChange={handleChange}
        step={step}
        {...(sliderLabel ? { thumbLabel: sliderLabel } : {})}
        thumbSize={THUMB_SIZE}
        value={value}
      />
    </div>
  );
}

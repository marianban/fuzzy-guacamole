import {
  Accordion as MantineAccordion,
  type AccordionProps as MantineAccordionProps,
  type AccordionStylesNames
} from '@mantine/core';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { omitUndefined } from '../../utils/object';
import styles from './accordion.module.css';

export type AccordionValue = string | string[] | null;

export interface AccordionItem {
  content: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface AccordionProps extends Omit<
  MantineAccordionProps<boolean>,
  'children' | 'className' | 'defaultValue' | 'onChange' | 'value'
> {
  className?: string;
  defaultValue?: AccordionValue;
  items: AccordionItem[];
  onChange?: (value: AccordionValue) => void;
  value?: AccordionValue;
}

const accordionClassNames: Partial<Record<AccordionStylesNames, string>> = omitUndefined({
  chevron: styles.chevron,
  content: styles.content,
  control: styles.control,
  item: styles.item,
  label: styles.label,
  panel: styles.panel,
  root: styles.accordionRoot
});

function getInitialValue(
  multiple: boolean,
  defaultValue: AccordionValue | undefined
): AccordionValue {
  if (defaultValue !== undefined) {
    return defaultValue;
  }

  return multiple ? [] : null;
}

function itemIsOpen(value: AccordionValue, itemValue: string) {
  return Array.isArray(value) ? value.includes(itemValue) : value === itemValue;
}

function AccordionChevron({ isOpen }: { isOpen: boolean }) {
  const Icon = isOpen ? ChevronUp : ChevronDown;
  const testId = isOpen ? 'accordion-chevron-up' : 'accordion-chevron-down';

  return <Icon aria-hidden="true" data-testid={testId} size={16} strokeWidth={1.75} />;
}

/**
 * A compact themed accordion based on Mantine's Accordion primitive.
 */
export function Accordion({
  className,
  defaultValue,
  items,
  keepMounted = false,
  multiple = false,
  onChange,
  radius = 'xs',
  transitionDuration = 0,
  value,
  variant = 'default',
  ...props
}: AccordionProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<AccordionValue>(() =>
    getInitialValue(multiple, defaultValue)
  );

  function handleChange(nextValue: AccordionValue) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  }

  const currentValue = isControlled ? (value ?? null) : internalValue;

  return (
    <MantineAccordion
      {...props}
      className={clsx(styles.root, className)}
      classNames={accordionClassNames}
      disableChevronRotation
      keepMounted={keepMounted}
      multiple={multiple}
      onChange={handleChange}
      radius={radius}
      transitionDuration={transitionDuration}
      value={currentValue}
      variant={variant}
    >
      {items.map((item) => {
        const isOpen = itemIsOpen(currentValue, item.value);

        return (
          <MantineAccordion.Item key={item.value} value={item.value}>
            <MantineAccordion.Control
              chevron={<AccordionChevron isOpen={isOpen} />}
              disabled={item.disabled}
            >
              {item.label}
            </MantineAccordion.Control>
            <MantineAccordion.Panel>{item.content}</MantineAccordion.Panel>
          </MantineAccordion.Item>
        );
      })}
    </MantineAccordion>
  );
}

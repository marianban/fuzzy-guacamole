import { LoadingOverlay } from '@mantine/core';
import { useForm, type ReactFormExtendedApi } from '@tanstack/react-form';
import { Suspense, useMemo, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  PresetDetail,
  PresetModelCategory,
  PresetModelField
} from '@shared/presets';
import { useSuspensePreset, useSuspensePresets } from '#root/api/presets/queries';
import { Accordion } from '#root/components/accordion/accordion';
import { ButtonBar } from '#root/components/button-bar/button-bar';
import { Slider } from '#root/components/slider/slider';
import { TextArea } from '#root/components/text-area/text-area';

import { PresetSelector } from '../-preset-selector/preset-selector';
import styles from './control-panel.module.css';

type FormValues = Record<string, unknown>;
type LocalizedText = Record<string, string>;
type ControlForm = ReactFormExtendedApi<
  FormValues,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  unknown
>;
type InputMode = NonNullable<InputHTMLAttributes<HTMLInputElement>['inputMode']>;

const supportedInputModes = new Set<InputMode>([
  'decimal',
  'email',
  'none',
  'numeric',
  'search',
  'tel',
  'text',
  'url'
]);

function resolveLocalizedText(
  text: LocalizedText,
  locale: string | undefined,
  fallback: string
) {
  if (!locale) {
    return text.en ?? Object.values(text)[0] ?? fallback;
  }

  const [baseLanguage = locale] = locale.split('-');

  return (
    text[locale] ?? text[baseLanguage] ?? text.en ?? Object.values(text)[0] ?? fallback
  );
}

function sortByOrder<T extends { order: number }>(items: T[]) {
  return [...items].sort((left, right) => left.order - right.order);
}

function resolveFieldDefault(preset: PresetDetail, field: PresetModelField) {
  if (Object.prototype.hasOwnProperty.call(preset.defaults, field.id)) {
    return preset.defaults[field.id];
  }

  return field.default ?? '';
}

function buildDefaultValues(preset: PresetDetail) {
  return Object.fromEntries(
    preset.model.fields.map((field) => [field.id, resolveFieldDefault(preset, field)])
  );
}

function fieldIsVisible(field: PresetModelField, values: FormValues) {
  if (!field.visibility) {
    return true;
  }

  return values[field.visibility.field] === field.visibility.equals;
}

function getNumericValue(value: unknown, fallback: number) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function requireDefaultPresetId(presetId: string | null) {
  if (!presetId) {
    throw new Error('Preset list did not include a default preset id.');
  }

  return presetId;
}

function ControlField({
  field,
  form,
  locale
}: {
  field: PresetModelField;
  form: ControlForm;
  locale: string | undefined;
}) {
  const label = resolveLocalizedText(field.label, locale, field.id);

  return (
    <form.Field name={field.id}>
      {(formField) => {
        if (field.control.type === 'slider' || field.control.type === 'range') {
          return (
            <Slider
              aria-label={label}
              label={label}
              max={field.control.max}
              min={field.control.min}
              onChange={formField.handleChange}
              step={field.control.step}
              value={getNumericValue(formField.state.value, field.control.min)}
            />
          );
        }

        if (field.control.type === 'select') {
          return (
            <ButtonBar
              aria-label={label}
              data={field.control.options.map((option) => ({
                label: resolveLocalizedText(option.label, locale, option.value),
                value: option.value
              }))}
              label={label}
              onChange={formField.handleChange}
              value={getStringValue(formField.state.value)}
            />
          );
        }

        if (field.control.multiline) {
          return (
            <TextArea
              id={formField.name}
              label={label}
              maxLength={field.control.maxLength ?? field.validation.maxLength}
              name={formField.name}
              onBlur={formField.handleBlur}
              onChange={(event) => formField.handleChange(event.target.value)}
              placeholder={
                field.control.placeholder
                  ? resolveLocalizedText(field.control.placeholder, locale, field.id)
                  : undefined
              }
              rows={field.control.rows}
              value={getStringValue(formField.state.value)}
            />
          );
        }

        return (
          <label className={styles.textField}>
            <span className={styles.label}>{label}</span>
            <input
              className={styles.input}
              inputMode={
                supportedInputModes.has(field.control.inputMode as InputMode)
                  ? (field.control.inputMode as InputMode)
                  : undefined
              }
              maxLength={field.control.maxLength ?? field.validation.maxLength}
              name={formField.name}
              onBlur={formField.handleBlur}
              onChange={(event) => {
                const nextValue =
                  field.fieldType === 'integer' || field.fieldType === 'number'
                    ? event.target.valueAsNumber
                    : event.target.value;

                formField.handleChange(
                  Number.isNaN(nextValue) ? event.target.value : nextValue
                );
              }}
              placeholder={
                field.control.placeholder
                  ? resolveLocalizedText(field.control.placeholder, locale, field.id)
                  : undefined
              }
              type={
                field.fieldType === 'integer' || field.fieldType === 'number'
                  ? 'number'
                  : 'text'
              }
              value={getStringValue(formField.state.value)}
            />
          </label>
        );
      }}
    </form.Field>
  );
}

function FieldGroup({
  fields,
  form,
  locale
}: {
  fields: PresetModelField[];
  form: ControlForm;
  locale: string | undefined;
}) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => (
        <div className={styles.fieldGroup}>
          {fields
            .filter((field) => fieldIsVisible(field, values))
            .map((field) => (
              <ControlField key={field.id} field={field} form={form} locale={locale} />
            ))}
        </div>
      )}
    </form.Subscribe>
  );
}

function buildCategoryItems(
  categories: PresetModelCategory[],
  fields: PresetModelField[],
  form: ControlForm,
  locale: string | undefined
) {
  return sortByOrder(categories)
    .map((category) => {
      const categoryFields = sortByOrder(
        fields.filter((field) => field.categoryId === category.id)
      );

      if (categoryFields.length === 0) {
        return null;
      }

      return {
        content: <FieldGroup fields={categoryFields} form={form} locale={locale} />,
        label: resolveLocalizedText(category.label, locale, category.id),
        value: category.id
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function LoadedControlPanel({
  preset,
  presetId
}: {
  preset: PresetDetail;
  presetId: string;
}) {
  const { i18n } = useTranslation();
  const defaultValues = useMemo(() => buildDefaultValues(preset), [preset]);
  const form = useForm<
    FormValues,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >({ defaultValues });
  const topLevelFields = useMemo(
    () => sortByOrder(preset.model.fields.filter((field) => !field.categoryId)),
    [preset.model.fields]
  );
  const categoryItems = useMemo(
    () =>
      buildCategoryItems(
        preset.model.categories,
        preset.model.fields,
        form,
        i18n.resolvedLanguage
      ),
    [form, i18n.resolvedLanguage, preset.model.categories, preset.model.fields]
  );
  const defaultExpandedCategories = useMemo(
    () =>
      preset.model.categories
        .filter((category) => category.presentation.defaultExpanded)
        .map((category) => category.id),
    [preset.model.categories]
  );

  return (
    <form className={styles.root}>
      <PresetSelector label="Preset Selector" presetId={presetId} />
      {topLevelFields.length > 0 ? (
        <FieldGroup fields={topLevelFields} form={form} locale={i18n.resolvedLanguage} />
      ) : null}
      {categoryItems.length > 0 ? (
        <Accordion
          defaultValue={defaultExpandedCategories}
          items={categoryItems}
          multiple
        />
      ) : null}
    </form>
  );
}

export function ControlPanel() {
  return (
    <div className={styles.shell}>
      <Suspense fallback={<ControlPanelLoadingOverlay />}>
        <ControlPanelContent />
      </Suspense>
    </div>
  );
}

function ControlPanelLoadingOverlay() {
  return (
    <LoadingOverlay
      data-testid="control-panel-loading-overlay"
      overlayProps={{ backgroundOpacity: 0 }}
      visible
    />
  );
}

function ControlPanelContent() {
  const { data: presets } = useSuspensePresets();
  const presetId = requireDefaultPresetId(presets.defaultPresetId);
  const { data: preset } = useSuspensePreset(presetId);

  return <LoadedControlPanel key={presetId} preset={preset} presetId={presetId} />;
}

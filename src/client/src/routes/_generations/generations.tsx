import { createFileRoute } from '@tanstack/react-router';

import { ControlPanel } from './-control-panel/control-panel';
import { ControlPanelFooter } from './-control-panel-footer/control-panel-footer';
import { GenerationHistory } from './-generation-history';
import styles from './generations.module.css';
import { SidePanel } from '#root/components/side-panel/side-panel';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_generations/generations')({
  component: GenerationsPage
});

export function GenerationsPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.canvas} data-testid="generation-canvas" />
      <SidePanel
        className={styles.sidePanel}
        title={t('Generations.SidePanel.Title', 'Control Panel')}
        content={<ControlPanel />}
        footer={<ControlPanelFooter />}
      />
      <GenerationHistory />
    </div>
  );
}

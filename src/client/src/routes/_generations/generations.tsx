import { createFileRoute } from '@tanstack/react-router';

import { GenerationHistory } from './-generation-history';
import styles from './generations.module.css';
import { SidePanel } from '../../components/side-panel/side-panel';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_generations/generations')({
  component: GenerationsPage
});

export function GenerationsPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.canvas} data-testid="generation-canvas" />
      <aside className={styles.sidePanel}>
        <SidePanel
          title={t('Generations.SidePanel.Title', 'Control Panel')}
          content={<div>Content goes here</div>}
          footer={<div>Footer goes here</div>}
        />
      </aside>
      <GenerationHistory />
    </div>
  );
}

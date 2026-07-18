import { Play, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ComponentPropsWithoutRef } from 'react';

import { Button } from '#root/components/button/button';

import { Diagnostics } from './diagnostics';
import styles from './control-panel-footer.module.css';

export interface ControlPanelFooterProps {
  onDelete?: ComponentPropsWithoutRef<'button'>['onClick'];
  onRun?: ComponentPropsWithoutRef<'button'>['onClick'];
}

/** Footer actions and diagnostics for the generation control panel. */
export function ControlPanelFooter({ onDelete, onRun }: ControlPanelFooterProps) {
  const { t } = useTranslation();
  const rerunLabel = t('Generations.ControlPanelFooter.Rerun', 'Rerun');
  const deleteLabel = t(
    'Generations.ControlPanelFooter.DeleteGeneration',
    'Delete generation'
  );

  return (
    <div className={styles.root} data-testid="control-panel-footer">
      <div className={styles.actions}>
        <Button
          fullWidth
          leftSection={<Play aria-hidden="true" size={14} strokeWidth={2} />}
          onClick={onRun}
        >
          {rerunLabel}
        </Button>
        <Button
          aria-label={deleteLabel}
          className={styles.deleteButton}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
        </Button>
      </div>
      <Diagnostics />
    </div>
  );
}

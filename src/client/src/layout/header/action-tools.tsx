import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Redo2, SquareSplitHorizontal, Undo2 } from 'lucide-react';

import { Button } from '../../components/button/button';
import styles from './action-tools.module.css';

interface ActionTool {
  label: string;
  icon: LucideIcon;
  dividerAfter?: boolean;
}

const ACTION_TOOLS = [
  { label: 'Undo', icon: Undo2 },
  { label: 'Redo', icon: Redo2, dividerAfter: true },
  { label: 'Split view', icon: SquareSplitHorizontal }
] satisfies readonly ActionTool[];

export const ActionTools = () => {
  return (
    <div aria-label="Action tools" className={styles.actionTools} role="toolbar">
      {ACTION_TOOLS.map(({ label, icon: Icon, dividerAfter }) => (
        <Fragment key={label}>
          <Button
            aria-label={label}
            className={styles.actionButton}
            size="compact-md"
            variant="unstyled"
          >
            <span className={styles.actionButtonIcon}>
              <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
            </span>
          </Button>
          {dividerAfter ? (
            <span aria-hidden="true" className={styles.actionDivider} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
};

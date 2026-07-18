import { useTranslation } from 'react-i18next';

import styles from './diagnostics.module.css';

export type DiagnosticMessageType = 'info' | 'warn' | 'error';

export interface DiagnosticMessage {
  id: string;
  message: string;
  timestamp: string;
  type: DiagnosticMessageType;
}

const mockDiagnostics: DiagnosticMessage[] = [
  {
    id: 'workflow-started',
    message: 'Initializing workflow...',
    timestamp: '12:00:01',
    type: 'info'
  },
  {
    id: 'graph-warning',
    message: 'Prompt graph contains an optional node.',
    timestamp: '12:00:02',
    type: 'warn'
  },
  {
    id: 'output-error',
    message: 'Preview could not be loaded.',
    timestamp: '12:00:04',
    type: 'error'
  }
];

const diagnosticTypeLabels: Record<DiagnosticMessageType, string> = {
  error: 'ERROR',
  info: 'INFO',
  warn: 'WARN'
};

export interface DiagnosticsProps {
  messages?: DiagnosticMessage[];
}

/** Compact run log showing the current generation diagnostics. */
export function Diagnostics({ messages = mockDiagnostics }: DiagnosticsProps) {
  const { t } = useTranslation();
  const diagnosticsLabel = t('Generations.ControlPanelFooter.Diagnostics', 'Diagnostics');

  return (
    <section
      aria-label={diagnosticsLabel}
      aria-live="polite"
      className={styles.panel}
      role="log"
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{diagnosticsLabel}</h3>
        <span aria-hidden="true" className={styles.statusIndicator} />
      </header>

      <div className={styles.entries}>
        {messages.map((diagnostic) => (
          <article
            className={styles.message}
            data-message-type={diagnostic.type}
            key={diagnostic.id}
            title={diagnostic.message}
          >
            <div className={styles.metadata}>
              <time className={styles.timestamp}>{diagnostic.timestamp}</time>
              <span className={styles.type}>{diagnosticTypeLabels[diagnostic.type]}</span>
            </div>
            <p className={styles.messageText}>{diagnostic.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

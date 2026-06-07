import styles from './header-hardware-info.module.css';

export interface HeaderHardwareInfoProps {
  label: string;
  detail: string;
  utilizationPercent: number;
}

export const HeaderHardwareInfo = ({
  label,
  detail,
  utilizationPercent
}: HeaderHardwareInfoProps) => {
  const normalizedPercent = Math.min(100, Math.max(0, utilizationPercent));

  return (
    <div className={styles.hardwareInfo}>
      <div className={styles.hardwareHeader}>
        <span className={styles.hardwareLabel}>{label}</span>
      </div>
      <div className={styles.hardwareFooter}>
        <div
          aria-label="Hardware utilization"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={normalizedPercent}
          className={styles.hardwareMeterTrack}
          role="progressbar"
        >
          <span
            aria-hidden="true"
            className={styles.hardwareMeterFill}
            style={{ width: `${normalizedPercent}%` }}
          />
        </div>
        <span className={styles.hardwareDetail}>{detail}</span>
      </div>
    </div>
  );
};

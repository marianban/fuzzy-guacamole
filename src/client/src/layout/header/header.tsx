import styles from './header.module.css';
import { ActionTools } from './action-tools';
import { HeaderGlobalStatus, type HeaderGlobalStatusProps } from './header-global-status';
import { HeaderHardwareInfo, type HeaderHardwareInfoProps } from './header-hardware-info';
import { Navigation } from './navigation';
import { HeaderLogo } from './header-logo';

const DEFAULT_HARDWARE_INFO: HeaderHardwareInfoProps = {
  label: 'NVIDIA RTX 4090',
  detail: '18.2 / 24GB',
  utilizationPercent: 76
};

const DEFAULT_GLOBAL_STATUS: HeaderGlobalStatusProps = {
  label: 'ONLINE',
  tone: 'online'
};

export interface HeaderProps {
  hardwareInfo?: HeaderHardwareInfoProps;
  globalStatus?: HeaderGlobalStatusProps;
}

export const Header = ({
  hardwareInfo = DEFAULT_HARDWARE_INFO,
  globalStatus = DEFAULT_GLOBAL_STATUS
}: HeaderProps) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftGroup}>
        <HeaderLogo />
        <Navigation />
      </div>

      <ActionTools />

      <div className={styles.rightGroup}>
        <HeaderHardwareInfo {...hardwareInfo} />
        <HeaderGlobalStatus {...globalStatus} />
      </div>
    </header>
  );
};

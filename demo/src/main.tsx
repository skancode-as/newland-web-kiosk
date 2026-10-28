import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KioskProvider, isKiosk } from 'newland-web-kiosk';
import { installMockNlScan } from 'newland-web-kiosk/mock';
import App from './App';
import './styles.css';

// The mock must exist before React mounts so the provider and hooks can
// subscribe against it. On a real kiosk this is null and window.nlScan is native.
const mock = isKiosk()
  ? null
  : installMockNlScan({
      deviceInfo: {
        model: 'Mock NQuire 1000',
        serialNumber: 'MOCK-0001',
        buildNumber: '2.21-mock',
        deviceName: 'Desktop Demo',
      },
    });

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element "#root" was not found.');
}

createRoot(container).render(
  <StrictMode>
    <KioskProvider power={true}>
      <App mock={mock} />
    </KioskProvider>
  </StrictMode>,
);

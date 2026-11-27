import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FloatingDetailViewerWindow } from './components/viewer/FloatingDetailViewer';
import './styles/globals.css';

function isViewerWindow(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    __ICT_VIEWER_WINDOW__?: boolean;
    __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
  };
  if (win.__ICT_VIEWER_WINDOW__) return true;
  if (win.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === 'detail-viewer') return true;
  return new URLSearchParams(window.location.search).get('view') === 'viewer';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isViewerWindow() ? <FloatingDetailViewerWindow /> : <App />}
  </StrictMode>,
);

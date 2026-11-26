import { EdgeStrip } from './components/shell/EdgeStrip';
import { FullScreenDashboard } from './components/shell/FullScreenDashboard';
import { PanelContainer } from './components/shell/PanelContainer';
import { useAutoLock } from './hooks/useAutoLock';
import { useHoverSlide } from './hooks/useHoverSlide';
import { useWindowLifecycle } from './hooks/useWindowLifecycle';
import { useDockStore } from './stores/dockStore';
import { useSettingsStore } from './stores/settingsStore';

export function App() {
  useWindowLifecycle();
  useAutoLock();

  const hydrated = useSettingsStore((s) => s.hydrated);
  const phase = useDockStore((s) => s.phase);

  const {
    handleStripEnter,
    handleStripLeave,
    handlePanelEnter,
    handlePanelLeave,
    openImmediately,
  } = useHoverSlide();

  if (!hydrated) {
    return null;
  }

  if (phase === 'fullscreen') {
    return <FullScreenDashboard />;
  }

  if (phase === 'collapsed') {
    return (
      <EdgeStrip
        onMouseEnter={handleStripEnter}
        onMouseLeave={handleStripLeave}
        onClick={openImmediately}
      />
    );
  }

  return (
    <PanelContainer
      onMouseEnter={handlePanelEnter}
      onMouseLeave={handlePanelLeave}
    />
  );
}

export default App;

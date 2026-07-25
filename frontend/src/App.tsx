import { BrandProfileScreen } from './pages/BrandProfileScreen';
import { DevDashboard, DevModeButton } from './dev/DevDashboard';
import { EditingLabScreen } from './pages/EditingLabScreen';
import { EditorScreen } from './editor/EditorScreen';
import { HomeScreen } from './pages/HomeScreen';
import { PlanScreen } from './pages/PlanScreen';
import { ProcessingScreen } from './pages/ProcessingScreen';
import { SetupScreen } from './pages/SetupScreen';
import { ThemeScreen } from './pages/ThemeScreen';
import { useAppStore } from './stores/useAppStore';

export default function App() {
  const screen = useAppStore((s) => s.screen);

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {screen === 'home' && <HomeScreen />}
      {screen === 'plan' && <PlanScreen />}
      {screen === 'brand' && <BrandProfileScreen />}
      {screen === 'theme' && <ThemeScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'processing' && <ProcessingScreen />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'test' && <EditingLabScreen />}
      <DevModeButton />
      <DevDashboard />
    </div>
  );
}

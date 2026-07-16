import { EditorScreen } from './editor/EditorScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { SetupScreen } from './screens/SetupScreen';
import { ThemeScreen } from './screens/ThemeScreen';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const screen = useAppStore((s) => s.screen);

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {screen === 'home' && <HomeScreen />}
      {screen === 'theme' && <ThemeScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'processing' && <ProcessingScreen />}
      {screen === 'editor' && <EditorScreen />}
    </div>
  );
}

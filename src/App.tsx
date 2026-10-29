import { Editor } from './components/Editor';
import { StartPage } from './components/StartPage';
import { useEditor } from './state/store';

export function App() {
  const hasTemplate = useEditor((s) => s.template !== null);
  const open = useEditor((s) => s.open);
  const close = useEditor((s) => s.close);
  return hasTemplate ? <Editor onExit={close} /> : <StartPage onOpen={open} />;
}

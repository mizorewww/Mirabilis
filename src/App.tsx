import { createAppRuntime } from "./bootstrap";
import {
  RuntimeProvider,
  useRuntime,
  type RuntimeInitializer,
  type RuntimeSource,
} from "./providers";
import "./App.css";

type AppProps = {
  initializeRuntime?: RuntimeInitializer<RuntimeSource>;
};

function App({ initializeRuntime = createAppRuntime }: AppProps) {
  return (
    <RuntimeProvider initializeRuntime={initializeRuntime}>
      <MirabilisShell />
    </RuntimeProvider>
  );
}

function MirabilisShell() {
  const runtime = useRuntime();

  return (
    <main className="app-shell" aria-labelledby="app-title">
      <section className="app-shell__panel">
        <h1 id="app-title">Mirabilis</h1>
        <p className="app-shell__status">Runtime {runtime.app.version}</p>
      </section>
    </main>
  );
}

export default App;

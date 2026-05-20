import { createAppRuntime, type AppRuntime } from "./bootstrap";
import { RuntimeProvider, useRuntime } from "./providers";
import "./App.css";

type AppProps = {
  initializeRuntime?: () => Promise<object>;
};

function App({ initializeRuntime = createAppRuntime }: AppProps) {
  return (
    <RuntimeProvider initializeRuntime={initializeRuntime}>
      <MirabilisShell />
    </RuntimeProvider>
  );
}

function MirabilisShell() {
  const runtime = useRuntime<Pick<AppRuntime, "app">>();

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

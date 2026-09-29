export function App() {
  return (
    <div className="shell">
      <div className="shell-topbar" role="toolbar" aria-orientation="horizontal">
        <span className="shell-wordmark">Gridline</span>

        <span className="shell-separator" aria-hidden="true" />

        <span className="shell-set">Tower B — Permit Set</span>

        <span className="shell-separator" aria-hidden="true" />

        <span className="shell-sheet">
          <span className="shell-sheet-number">A-101</span>
          <span className="shell-sheet-title">Level 1 Floor Plan</span>
        </span>
      </div>

      <main className="shell-canvas">
        <p className="shell-canvas-empty">No sheet loaded</p>
      </main>
    </div>
  );
}

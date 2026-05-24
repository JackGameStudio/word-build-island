// Word Island Builder — Entry Point
// Phase 0 verification: confirm Vite dev server works

const app = document.getElementById('app');

// Show a placeholder to confirm everything loads
app.innerHTML = `
  <div style="padding:40px;text-align:center">
    <h1 style="font-size:24px">🏝️ Word Island Builder</h1>
    <p style="margin-top:20px;color:var(--color-muted)">Phase 0 — Scaffold Ready</p>
    <button class="btn-pixel" style="margin-top:24px">Test Button</button>
  </div>
`;

console.log('Word Island Builder v0.1.0 — scaffold loaded');
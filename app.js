import { createDashboardServer } from './src/dashboard/server.js';
import { exec } from 'child_process';

const dashboard = createDashboardServer();

(async () => {
  const port = await dashboard.start();
  console.log(`\n======================================================`);
  console.log(`🚀 Marvik Dashboard & Control Center Running!`);
  console.log(`🌐 Local URL: http://localhost:${port}`);
  console.log(`======================================================\n`);

  // Start bot automatically in background
  dashboard.manager.startBot();

  // Open as a standalone Windows App window using Edge (built-in on Windows)
  const appUrl = `http://localhost:${port}`;
  const winCmd = `start msedge --app="${appUrl}" || start chrome --app="${appUrl}" || start "" "${appUrl}"`;

  exec(winCmd, (err) => {
    if (err) {
      console.log(`Dashboard available at: ${appUrl}`);
    }
  });
})();


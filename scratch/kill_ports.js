const { exec } = require('child_process');

function killPort(port) {
  return new Promise((resolve) => {
    console.log(`Checking port ${port}...`);
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (err || !stdout) {
        console.log(`Port ${port} is already free.`);
        return resolve();
      }

      const lines = stdout.split('\n');
      const pids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const state = parts[3];
          const pid = parts[4];
          if (state === 'LISTENING' && pid && pid !== '0') {
            pids.add(pid);
          }
        }
      }

      if (pids.size === 0) {
        console.log(`No listening processes found on port ${port}.`);
        return resolve();
      }

      const killPromises = Array.from(pids).map((pid) => {
        return new Promise((resKill) => {
          console.log(`Killing process ${pid} listening on port ${port}...`);
          exec(`taskkill /F /PID ${pid}`, (killErr, killStdout) => {
            if (killErr) {
              console.log(`Failed to kill process ${pid}: ${killErr.message}`);
            } else {
              console.log(`Successfully killed process ${pid}.`);
            }
            resKill();
          });
        });
      });

      Promise.all(killPromises).then(() => resolve());
    });
  });
}

async function run() {
  await killPort(8000);
  await killPort(8080);
  console.log("Port cleanup complete.");
}

run();

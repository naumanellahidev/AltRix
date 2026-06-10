const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const logFile = path.join(__dirname, 'diagnose_js.log');
fs.writeFileSync(logFile, '=== JS Diagnostics Start ===\n', 'utf8');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n', 'utf8');
}

const checkPort = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is open/in use
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free/closed
    });
    server.listen(port, '127.0.0.1');
  });
};

async function run() {
  log(`Time: ${new Date().toISOString()}`);
  log(`Current dir: ${process.cwd()}`);

  // 1. Check ports
  const ports = [8000, 8080, 8081, 8082, 5173, 9080, 3000];
  for (const port of ports) {
    const inUse = await checkPort(port);
    log(`Port ${port}: ${inUse ? 'IN USE' : 'FREE'}`);
  }

  // 2. Check python environment
  exec('python --version', (err, stdout, stderr) => {
    log(`python --version stdout: ${stdout.trim()}`);
    log(`python --version stderr: ${stderr.trim()}`);
    if (err) log(`python --version error: ${err.message}`);
  });

  exec('pip --version', (err, stdout, stderr) => {
    log(`pip --version stdout: ${stdout.trim()}`);
    log(`pip --version stderr: ${stderr.trim()}`);
  });

  // 3. Check node / npm
  log(`Node version: ${process.version}`);
  exec('npm -v', (err, stdout, stderr) => {
    log(`npm -v: ${stdout.trim()}`);
  });
}

run();

const net = require('net');
const fs = require('fs');
const path = require('path');

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

const run = async () => {
  const ports = [8000, 8080, 8081, 8082, 5173, 9080, 3000];
  let output = '--- Port Check Results ---\n';
  for (const port of ports) {
    const isOpen = await checkPort(port);
    output += `Port ${port}: ${isOpen ? 'OPEN (IN USE)' : 'CLOSED (FREE)'}\n`;
  }
  output += '-------------------------\n';
  
  fs.writeFileSync(path.join(__dirname, 'ports_status.txt'), output, 'utf8');
  console.log("Ports status file written.");
};

run();

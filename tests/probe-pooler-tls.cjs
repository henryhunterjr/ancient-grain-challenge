'use strict';
// Send only PostgreSQL's SSLRequest and complete TLS. No StartupMessage,
// username, password, SQL, or authentication is sent to the server.
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const host = process.argv[2];
const caPath = process.argv[3];
if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host || '')) throw Error('Expected public pooler hostname');
async function probe(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timeout = setTimeout(() => { socket.destroy(); reject(Error('TLS probe timed out')); }, 10000);
    const fail = error => { clearTimeout(timeout); socket.destroy(); reject(error); };
    socket.once('error', fail);
    socket.once('connect', () => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0);
      request.writeInt32BE(80877103, 4);
      socket.write(request);
    });
    socket.once('data', reply => {
      if (reply.length !== 1 || reply[0] !== 83) return fail(Error('Server did not accept PostgreSQL TLS'));
      socket.removeListener('error', fail);
      const secure = tls.connect({ socket, servername: host, minVersion: 'TLSv1.2', rejectUnauthorized: true,
        ...(caPath ? { ca: fs.readFileSync(caPath) } : {}) });
      secure.once('error', fail);
      secure.once('secureConnect', () => {
        clearTimeout(timeout);
        const chain = [];
        let certificate = secure.getPeerCertificate(true);
        while (certificate && !chain.some(c => c.fingerprint256 === certificate.fingerprint256)) {
          chain.push({ subject: certificate.subject, issuer: certificate.issuer, fingerprint256: certificate.fingerprint256,
            validFrom: certificate.valid_from, validTo: certificate.valid_to });
          certificate = certificate.issuerCertificate;
        }
        const result = { host, port, authorized: secure.authorized, protocol: secure.getProtocol(), chain,
          authenticationSent: false };
        secure.end();
        resolve(result);
      });
    });
  });
}
(async () => { for (const port of [5432, 6543]) console.log(JSON.stringify(await probe(port))); })()
  .catch(error => { console.error(error.code || error.message); process.exitCode = 1; });

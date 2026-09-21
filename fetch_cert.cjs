const tls = require('tls');
const fs = require('fs');

const host = 'mqtt.arijitroy.dpdns.org';
const port = 443;

const options = {
    host: host,
    port: port,
    rejectUnauthorized: false
};

const socket = tls.connect(options, () => {
    const cert = socket.getPeerCertificate(true);
    let currentCert = cert;
    let i = 0;
    while (currentCert) {
        console.log(`\n--- Certificate ${i} ---`);
        console.log('Subject:', currentCert.subject);
        console.log('Issuer:', currentCert.issuer);
        console.log('Valid From:', currentCert.valid_from);
        console.log('Valid To:', currentCert.valid_to);
        
        if (currentCert.raw) {
            const b64 = currentCert.raw.toString('base64');
            const pem = `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
            console.log(pem);
        }
        
        if (currentCert.issuerCertificate && currentCert.issuerCertificate.fingerprint256 !== currentCert.fingerprint256) {
            currentCert = currentCert.issuerCertificate;
        } else {
            break;
        }
        i++;
    }
    socket.destroy();
});

socket.on('error', (err) => {
    console.error('Error:', err);
});

const crypto = require('crypto');
const https = require('https');

const jwt_secret = "Ns2UVrOSTBj2ik0JiURxp6FGAjqWoia/H/zur7kg4d74mDSGHs9YdhIgDIOjWG0vgZdW0SVpK0irhae70F0GXg==";
const project_ref = "nhossjmkdjeeacbajelq";
const url = `https://${project_ref}.supabase.co/rest/v1/`;

// Base64URL helper
function base64url(buf) {
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Generate HS256 JWT
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iss: "supabase",
  ref: project_ref,
  role: "anon",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60) // 100 years
};

const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));

const signatureInput = `${encodedHeader}.${encodedPayload}`;
const signature = crypto.createHmac('sha256', jwt_secret)
  .update(signatureInput)
  .digest();

const encodedSignature = base64url(signature);
const token = `${signatureInput}.${encodedSignature}`;

console.log("Generated Token:", token);

// Verify
const req = https.get(url, {
  headers: {
    'apikey': token,
    'Authorization': `Bearer ${token}`
  }
}, (res) => {
  console.log("Status:", res.statusCode);
  if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 406 || res.statusCode === 400 || res.statusCode === 401) {
    // Wait, let's look at 401. If the secret was wrong, we would get 401.
    // If the secret is correct, we get 200/404/406.
    if (res.statusCode !== 401 && res.statusCode !== 403) {
      console.log("SUCCESS: The generated Anon key is 100% valid!");
    } else {
      console.log("FAILED: Verification failed with status code " + res.statusCode + " (Unauthorized)");
    }
  } else {
    console.log("FAILED: Verification failed with status code " + res.statusCode);
  }
});
req.on('error', (err) => {
  console.error("Error connecting to Supabase:", err);
});

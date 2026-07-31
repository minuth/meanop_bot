import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { CONFIG } from "../src/antigravity.js";

const PORT = 51121;
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;

const OAUTH = {
  CLIENT_ID: CONFIG.CLIENT_ID,
  CLIENT_SECRET: CONFIG.CLIENT_SECRET,
  TOKEN_ENDPOINT: CONFIG.TOKEN_ENDPOINT,
  AUTH_ENDPOINT: "https://accounts.google.com/o/oauth2/v2/auth",
  SCOPES: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs"
  ]
};

function buildAuthURL(state) {
  const params = new URLSearchParams({
    client_id: OAUTH.CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: OAUTH.SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `${OAUTH.AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams({
    client_id: OAUTH.CLIENT_ID,
    client_secret: OAUTH.CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI
  });

  const res = await fetch(OAUTH.TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${errorText}`);
  }

  return await res.json();
}

function openBrowser(url) {
  const start = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${start} "${url}"`, (err) => {
    if (err) console.log("Please open the URL manually in your browser.");
  });
}

function saveToken(refreshToken) {
  const authsDir = path.resolve(process.cwd(), "auths");
  if (!fs.existsSync(authsDir)) {
    fs.mkdirSync(authsDir, { recursive: true });
  }

  const filePath = path.join(authsDir, "antigravity.json");
  const data = {
    provider: "antigravity",
    refresh_token: refreshToken,
    updated_at: new Date().toISOString()
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`\nSuccessfully saved credentials to auths/antigravity.json`);

  const envPath = path.resolve(process.cwd(), ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const tokenRegex = /^ANTIGRAVITY_REFRESH_TOKEN=.*$/m;
  if (tokenRegex.test(envContent)) {
    envContent = envContent.replace(tokenRegex, `ANTIGRAVITY_REFRESH_TOKEN="${refreshToken}"`);
  } else {
    envContent = (envContent.trim() + `\nANTIGRAVITY_REFRESH_TOKEN="${refreshToken}"\n`).trim();
  }

  fs.writeFileSync(envPath, envContent + "\n", "utf8");
  console.log(`Updated .env with ANTIGRAVITY_REFRESH_TOKEN`);
}

async function main() {
  const state = Math.random().toString(36).substring(2);
  const authURL = buildAuthURL(state);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
      if (reqUrl.pathname === "/oauth-callback") {
        const code = reqUrl.searchParams.get("code");
        const returnedState = reqUrl.searchParams.get("state");

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h2>Authentication error: Invalid state</h2>");
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h2>Authentication error: Missing authorization code</h2>");
          return;
        }

        const tokenData = await exchangeCodeForTokens(code);
        if (!tokenData.refresh_token) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h2>Authentication failed: No refresh_token returned. Did you grant consent?</h2>");
          return;
        }

        saveToken(tokenData.refresh_token);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authentication successful! You can close this browser tab and return to your terminal.</h2>");

        console.log("\nAuthentication complete.");
        server.close();
        process.exit(0);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h2>Error: ${err.message}</h2>`);
      console.error("Login error:", err);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n--- Antigravity OAuth Login ---`);
    console.log(`Opening browser for Google Authentication...`);
    console.log(`If browser does not open automatically, visit:\n${authURL}\n`);
    openBrowser(authURL);
  });
}

main().catch(console.error);

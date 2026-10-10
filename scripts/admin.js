#!/usr/bin/env node
/*
 * Admin account management (run on the server, with MONGODB_URI set).
 *   npm run admin -- create --email ops@example.com --name "Ops Lead"     (prompts for the password)
 *   npm run admin -- promote --email someone@example.com                  (they must have two-factor on)
 *   npm run admin -- demote  --email someone@example.com
 *   npm run admin -- list
 * Non-interactive create: ADMIN_PASSWORD=... npm run admin -- create ...   (avoid leaving it in shell history)
 */
import readline from 'node:readline';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { env } from '../server/src/config/env.js';
import { createAdmin, promote, demote, listAdmins } from '../server/src/services/adminCliService.js';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };

function askHidden(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { console.error('No terminal to prompt on. Set ADMIN_PASSWORD instead.'); process.exit(2); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(prompt); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function main() {
  mongoose.set('sanitizeFilter', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    if (cmd === 'create') {
      let password = process.env.ADMIN_PASSWORD;
      if (!password) {
        password = await askHidden('Password (12+ characters): ');
        if (password !== await askHidden('Repeat password: ')) throw Object.assign(new Error('Passwords do not match.'), { cli: true });
      }
      const r = await createAdmin({ email: arg('email'), name: arg('name'), password });
      console.log(`\nAdmin created: ${r.user.email}\n\nTwo-factor sign-in is already ON for this account. Scan this with an authenticator app now:\n`);
      console.log(await QRCode.toString(r.otpauthUri, { type: 'terminal', small: true }));
      console.log(`Or enter this key manually: ${r.secret}\n\nRecovery codes (each works once — store them somewhere safe; they are not shown again):`);
      for (let i = 0; i < r.recoveryCodes.length; i += 2) console.log(`  ${r.recoveryCodes[i]}    ${r.recoveryCodes[i + 1]}`);
      console.log('\nSign in at /login with the email, password and a 6-digit code, then open /admin.');
    } else if (cmd === 'promote') {
      const r = await promote(arg('email'));
      console.log(r.changed ? `${r.user.email} is now an admin. Their sessions were signed out; they must sign in again with their authenticator code.` : `${r.user.email} is already an admin.`);
    } else if (cmd === 'demote') {
      const r = await demote(arg('email'));
      console.log(r.changed ? `${r.user.email} is no longer an admin. Their sessions were signed out.` : `${r.user.email} was not an admin.`);
    } else if (cmd === 'list') {
      const admins = await listAdmins();
      if (!admins.length) console.log('No admins yet. Create one with: npm run admin -- create --email you@example.com --name "Your Name"');
      for (const a of admins) console.log(`${a.email.padEnd(36)} ${a.name.padEnd(24)} 2FA ${a.mfa?.enabled ? 'on ' : 'OFF'}  last sign-in ${a.lastLoginAt ? a.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'never'}`);
    } else {
      console.error('Usage: npm run admin -- <create --email E --name N | promote --email E | demote --email E | list>');
      process.exitCode = 2;
    }
  } finally { await mongoose.disconnect(); }
}
main().catch((e) => { console.error(e.cli ? e.message : `Failed: ${e.message}`); process.exit(1); });

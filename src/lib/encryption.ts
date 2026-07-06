import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

function getEncryptionKey(): Buffer {
  let keyHex = process.env.ENCRYPTION_KEY;
  const homeDir = os.homedir();
  const parentEnvPath = `${homeDir}/ANTIGRAVITY/.env`;

  if (!keyHex) {
    // Try to read from parent .env
    if (fs.existsSync(parentEnvPath)) {
      const content = fs.readFileSync(parentEnvPath, 'utf8');
      const match = content.match(/ENCRYPTION_KEY="?([a-f0-9]{64})"?/);
      if (match) {
        keyHex = match[1];
        process.env.ENCRYPTION_KEY = keyHex;
      }
    }
  }

  if (!keyHex) {
    // Generate a secure 32-byte key (64 hex characters)
    keyHex = crypto.randomBytes(32).toString('hex');
    if (fs.existsSync(parentEnvPath)) {
      fs.appendFileSync(parentEnvPath, `\nENCRYPTION_KEY="${keyHex}"\n`);
    }
    // Also append to local .env just in case
    const localEnvPath = `${homeDir}/ANTIGRAVITY/productivity-app/.env`;
    if (fs.existsSync(localEnvPath)) {
      fs.appendFileSync(localEnvPath, `\nENCRYPTION_KEY="${keyHex}"\n`);
    }
    process.env.ENCRYPTION_KEY = keyHex;
    console.log("Generated new secure ENCRYPTION_KEY in .env");
  }

  return Buffer.from(keyHex, 'hex');
}

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
}

export function decrypt(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Return as-is if it's a legacy plain-text password
    return encryptedText;
  }
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

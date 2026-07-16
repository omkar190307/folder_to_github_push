import { safeStorage } from 'electron';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';

export class SecurityService {
  private static store: Store | null = null;
  private static fallbackKey: Buffer | null = null;

  private static getStore(): Store {
    if (!this.store) {
      this.store = new Store({ name: 'security_config' });
    }
    return this.store;
  }

  private static getFallbackKey(): Buffer {
    if (this.fallbackKey) return this.fallbackKey;
    
    const store = this.getStore();
    let hexKey = store.get('encryption_key') as string;
    
    if (!hexKey) {
      const newKey = crypto.randomBytes(32);
      hexKey = newKey.toString('hex');
      store.set('encryption_key', hexKey);
      this.fallbackKey = newKey;
    } else {
      this.fallbackKey = Buffer.from(hexKey, 'hex');
    }
    
    return this.fallbackKey;
  }

  /**
   * Encrypt a sensitive string using Electron's safeStorage (OS level)
   * or falling back to AES-256-GCM.
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return '';
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedBuffer = safeStorage.encryptString(plainText);
        return 'safestorage:' + encryptedBuffer.toString('base64');
      }
    } catch (err) {
      console.error('safeStorage encryption failed, falling back to AES', err);
    }

    // Fallback encryption
    try {
      const key = this.getFallbackKey();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      
      const payload = {
        iv: iv.toString('base64'),
        content: encrypted.toString('base64'),
        tag: tag.toString('base64')
      };
      return 'aes256gcm:' + Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (err) {
      throw new Error('Encryption failed: ' + (err as Error).message);
    }
  }

  /**
   * Decrypts a sensitive string.
   */
  public static decrypt(cipherText: string): string {
    if (!cipherText) return '';
    
    if (cipherText.startsWith('safestorage:')) {
      try {
        const encryptedBase64 = cipherText.substring('safestorage:'.length);
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
        return safeStorage.decryptString(encryptedBuffer);
      } catch (err) {
        throw new Error('OS safeStorage decryption failed: ' + (err as Error).message);
      }
    }

    if (cipherText.startsWith('aes256gcm:')) {
      try {
        const payloadBase64 = cipherText.substring('aes256gcm:'.length);
        const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadStr);
        
        const key = this.getFallbackKey();
        const iv = Buffer.from(payload.iv, 'base64');
        const tag = Buffer.from(payload.tag, 'base64');
        const encrypted = Buffer.from(payload.content, 'base64');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (err) {
        throw new Error('Fallback AES decryption failed: ' + (err as Error).message);
      }
    }

    return cipherText;
  }

  /**
   * Prevents path traversal and checks if target is a valid system path
   */
  public static validatePath(targetPath: string): boolean {
    if (!targetPath) return false;
    try {
      const resolvedPath = path.resolve(targetPath);
      if (!fs.existsSync(resolvedPath)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes repository name to prevent GitHub API or injection issues
   */
  public static sanitizeRepoName(name: string): string {
    return name
      .trim()
      .replace(/[^a-zA-Z0-9-_\.]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  /**
   * Sanitizes generic string inputs
   */
  public static sanitizeString(input: string): string {
    if (!input) return '';
    return input.replace(/[<>'"&]/g, (match) => {
      switch (match) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case "'": return '&#x27;';
        case '"': return '&quot;';
        case '&': return '&amp;';
        default: return match;
      }
    });
  }
}

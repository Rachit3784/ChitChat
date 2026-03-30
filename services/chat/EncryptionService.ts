import nacl from 'tweetnacl';
import forge from 'node-forge';
import * as Keychain from 'react-native-keychain';
import firestore from '@react-native-firebase/firestore';
import { fromByteArray, toByteArray } from 'base64-js';

const KEYCHAIN_SERVICE_PRIVATE = 'secure_chat_private_key';

// Fallback PRNG for tweetnacl if global.crypto is missing/unreliable
nacl.setPRNG((x, n) => {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});

/** Convert Uint8Array to forge binary string safely */
function uint8ToForgeBytes(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return binary;
}

class EncryptionService {
  /**
   * Generates a new ECDH Curve25519 key pair and stores it.
   */
  public async generateAndStoreKeyPair(uid: string): Promise<{ publicKey: string; keyUpdatedAt: number }> {
    const keyPair = nacl.box.keyPair();
    const publicKeyBase64 = fromByteArray(keyPair.publicKey);
    const privateKeyBase64 = fromByteArray(keyPair.secretKey);

    // Save Private Key in Keychain
    await Keychain.setGenericPassword(uid, privateKeyBase64, {
      service: KEYCHAIN_SERVICE_PRIVATE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
    });

    // Save Public Key + keyUpdatedAt in Firestore users collection
    const keyUpdatedAt = Date.now();
    await firestore().collection('users').doc(uid).set({
      publicKey: publicKeyBase64,
      keyUpdatedAt: keyUpdatedAt,
    }, { merge: true });

    return { publicKey: publicKeyBase64, keyUpdatedAt };
  }

  /**
   * Retrieves the user's private key from Keychain.
   */
  private async getMyPrivateKey(uid: string): Promise<Uint8Array | null> {
    const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE_PRIVATE });
    if (credentials && credentials.username === uid) {
      return toByteArray(credentials.password);
    }
    return null;
  }

  /**
   * Checks if the user's private key exists locally.
   */
  public async hasLocalPrivateKey(uid: string): Promise<boolean> {
    const pk = await this.getMyPrivateKey(uid);
    return !!pk;
  }

  /**
   * Retrieves a contact's public key from Firestore.
   */
  public async getContactPublicKey(contactUid: string): Promise<Uint8Array | null> {
    try {
      const userDoc = await firestore().collection('users').doc(contactUid).get();
      const data = userDoc.data();
      if (data && data.publicKey) {
        return toByteArray(data.publicKey);
      }
    } catch (error) {
      console.error(`[EncryptionService] Error fetching public key for ${contactUid}:`, error);
    }
    return null;
  }

  /**
   * Generates a shared secret using ECDH.
   */
  public async getSharedSecret(myUid: string, contactPublicKey: Uint8Array): Promise<Uint8Array | null> {
    const myPrivateKey = await this.getMyPrivateKey(myUid);
    if (!myPrivateKey) return null;
    
    return nacl.box.before(contactPublicKey, myPrivateKey);
  }

  /**
   * Encrypts a string using AES-256-GCM.
   */
  public encrypt(text: string, sharedSecret: Uint8Array): { cipherText: string; iv: string } {
    const iv = nacl.randomBytes(12);
    
    const forgeKey = forge.util.createBuffer(uint8ToForgeBytes(sharedSecret));
    const forgeIv = forge.util.createBuffer(uint8ToForgeBytes(iv));
    
    const cipher = forge.cipher.createCipher('AES-GCM', forgeKey);
    cipher.start({
      iv: forgeIv,
      tagLength: 128
    });
    cipher.update(forge.util.createBuffer(text, 'utf8'));
    cipher.finish();

    const cipherText = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();

    // Combine cipherText and tag for transmission
    const combined = cipherText + tag;
    
    return {
      cipherText: forge.util.encode64(combined),
      iv: forge.util.encode64(forgeIv.getBytes())
    };
  }

  /**
   * Decrypts a base64 cipherText using AES-256-GCM.
   */
  public decrypt(encryptedData: { cipherText: string; iv: string }, sharedSecret: Uint8Array): string | null {
    try {
      const combined = forge.util.decode64(encryptedData.cipherText);
      const iv = forge.util.decode64(encryptedData.iv);
      
      const cipherText = combined.slice(0, -16);
      const tag = combined.slice(-16);

      const forgeKey = forge.util.createBuffer(uint8ToForgeBytes(sharedSecret));
      const forgeIv = forge.util.createBuffer(iv);
      const forgeTag = forge.util.createBuffer(tag);

      const decipher = forge.cipher.createDecipher('AES-GCM', forgeKey);
      decipher.start({
        iv: forgeIv,
        tag: forgeTag,
        tagLength: 128
      });
      decipher.update(forge.util.createBuffer(cipherText));
      const success = decipher.finish();

      if (success) {
        return decipher.output.toString();
      }
      return null;
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
}

export default new EncryptionService();

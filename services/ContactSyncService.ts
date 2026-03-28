import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import firestore from '@react-native-firebase/firestore';
import LocalDBService, { LocalContact } from '../localDB/LocalDBService';

class ContactSyncService {
  /**
   * Request contact permissions on Android
   */
  private async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'Contacts Permission',
          message: 'This app would like to view your contacts to find friends.',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.error('Permission error:', err);
      return false;
    }
  }

  /**
   * Normalize phone numbers to E.164 format
   */
  private normalizeNumber(number: string, region: any = 'IN'): string | null {
    const phoneNumber = parsePhoneNumberFromString(number, region);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
    // Fallback simple cleanup if library fails
    const clean = number.replace(/\D/g, '');
    if (clean.length >= 10) {
      return '+' + clean;
    }
    return null;
  }

  /**
   * Helper to add a delay
   */
  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Main sync function
   */
  public async syncContacts(): Promise<void> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.log('No contact permission');
      return;
    }

    try {
      // 1. Fetch from Phone
      const phoneContacts = await Contacts.getAll();
      const localContactsData: Partial<LocalContact>[] = [];

      phoneContacts.forEach((contact) => {
        contact.phoneNumbers.forEach((num) => {
          const normalized = this.normalizeNumber(num.number);
          if (normalized) {
            localContactsData.push({
              phoneNumber: normalized,
              name: contact.displayName || `${contact.givenName} ${contact.familyName}`.trim(),
              photo: contact.thumbnailPath || null,
              isRegistered: 0,
              lastSync: Date.now(),
            });
          }
        });
      });

      // 2. Initial Upsert (to store names/numbers from phone)
      if (localContactsData.length > 0) {
        LocalDBService.upsertContacts(localContactsData);
      }

      // 3. Filtering: Get numbers that need lookup
      const unknownNumbers = LocalDBService.getUnknownNumbers();
      if (unknownNumbers.length === 0) {
        console.log('No new numbers to sync with Firebase');
        return;
      }

      console.log(`Starting Firebase lookup for ${unknownNumbers.length} unknown numbers...`);

      // 4. Firebase Lookup (Chunked in batches of 20 as requested)
      const BATCH_SIZE = 20;
      for (let i = 0; i < unknownNumbers.length; i += BATCH_SIZE) {
        const batch = unknownNumbers.slice(i, i + BATCH_SIZE);
        
        try {
          const querySnapshot = await firestore()
            .collection('users')
            .where('mobileNumber', 'in', batch)
            .get();

          if (!querySnapshot.empty) {
            const registeredUpdates: Partial<LocalContact>[] = [];
            
            querySnapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (data.photo) {
                console.log(`[ContactSyncService] Found Firebase photo for ${data.mobileNumber}`);
              }
              registeredUpdates.push({
                phoneNumber: data.mobileNumber,
                firebase_uid: doc.id,
                // Always use Firebase photo — it's the authoritative source
                photo: data.photo || null,
                name: data.name || data.username || undefined,
                isRegistered: 1,
                lastSync: Date.now(),
              });
            });

            // 5. Update Cache with registered info
            if (registeredUpdates.length > 0) {
              LocalDBService.upsertContacts(registeredUpdates);
            }
          }
        } catch (batchError) {
          console.error(`Error syncing batch starting at index ${i}:`, batchError);
        }

        // Add a small delay (100ms) to prevent Firebase rate limits/crash and UI lag
        await this.sleep(100);
      }

      console.log('Contact sync completed successfully');
    } catch (error) {
      console.error('Error in syncContacts:', error);
    }
  }
}

export default new ContactSyncService();

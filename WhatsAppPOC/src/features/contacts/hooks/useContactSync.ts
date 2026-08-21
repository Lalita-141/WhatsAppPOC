import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Contacts from 'react-native-contacts';
import { syncContacts } from '../api/contactApi';

export interface RegisteredContact {
    userId: string;
    userOrganizationId: string;
    name: string;
    phone: string;
}

export interface NotRegisteredContact {
    name: string;
    phone: string;
}

export interface SyncedContacts {
    registered: RegisteredContact[];
    notRegistered: NotRegisteredContact[];
}

export const useContactSync = (apiBaseUrl: string, accessToken: string, shouldSync: boolean) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [syncedContacts, setSyncedContacts] = useState<SyncedContacts | null>(null);

    useEffect(() => {
        if (!shouldSync) return;

        let isMounted = true;

        const performSync = async () => {
            if (!isMounted) return;
            setIsSyncing(true);
            setSyncMessage("Requesting permission...");
            try {
                let permission = '';
                if (Platform.OS === 'android') {
                    const granted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
                        {
                            title: 'Contacts',
                            message: 'This app would like to view your contacts.',
                            buttonPositive: 'Please accept bare minimum',
                        }
                    );
                    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                        permission = 'authorized';
                    }
                } else if (Platform.OS === 'ios') {
                    permission = await Contacts.requestPermission();
                }

                if (permission === 'authorized') {
                    setSyncMessage("Reading contacts from device...");
                    // Read contacts
                    const deviceContacts = await Contacts.getAll();

                    console.log(' device contacts ', JSON.stringify(deviceContacts), ' length of device contacts ', deviceContacts.length);

                    // Format payload exactly as backend wants it
                    const formattedContacts = deviceContacts.map(c => {
                        const phone = c.phoneNumbers.length > 0 ? c.phoneNumbers[0].number : '';
                        return {
                            name: c.displayName || c.givenName || 'Unknown',
                            phone: phone,
                        };
                    }).filter(c => c.phone !== ''); // filter out contacts without phone numbers

                    // Send to backend
                    if (formattedContacts.length > 0) {
                        setSyncMessage(`Sending ${formattedContacts.length} contacts to backend...`);
                        const response = await syncContacts(apiBaseUrl, accessToken, { contacts: formattedContacts });
                        if (response && response.data && isMounted) {
                            setSyncedContacts(response.data);
                        }
                        setSyncMessage('✅ Contacts synced successfully!');
                    } else {
                        setSyncMessage('⚠️ No phone numbers found in contacts.');
                    }
                } else {
                    setSyncMessage('❌ Contact permission denied');
                }
            } catch (err: any) {
                setSyncMessage(`❌ Error: ${err.message}`);
                console.error('Error syncing contacts:', err);
            } finally {
                if (isMounted) {
                    setIsSyncing(false);
                    // Clear the message after 5 seconds if it was successful
                    setTimeout(() => {
                        if (isMounted) setSyncMessage(null);
                    }, 5000);
                }
            }
        };

        const timeoutId = setTimeout(() => {
            performSync();
        }, 1000);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [apiBaseUrl, accessToken, shouldSync]);

    return { isSyncing, syncMessage, syncedContacts };
};

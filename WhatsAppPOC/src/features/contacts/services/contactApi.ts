export const syncContacts = async (apiBaseUrl: string, accessToken: string, contactsPayload: any) => {
    const url = `${apiBaseUrl}/api/v1/chat/contacts/check`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`, // Assuming you need auth token
        },
        body: JSON.stringify(contactsPayload),
    });

    const responseText = await response.text();

    if (!response.ok) {
        try {
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.message || 'Failed to sync contacts');
        } catch (e) {
            // If it's not JSON (like an HTML error page), throw a generic error with status
            throw new Error(`Server returned ${response.status}: Failed to sync contacts`);
        }
    }

    try {
        return JSON.parse(responseText);
    } catch (e) {
        throw new Error('Server returned invalid JSON response');
    }
};

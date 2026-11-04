export interface CheckContactsRequest {
    contacts: {
        name: string;
        phone: string;
    }[];
}

// One sync request is capped, so a client cannot scan the whole user table.
export const MAX_CONTACTS_PER_REQUEST = 5000;

export const validateCheckContactsRequest = (
    body: CheckContactsRequest,
): string | null => {
    if (!body?.contacts) {
        return "Contacts are required";
    }

    if (!Array.isArray(body.contacts)) {
        return "Contacts must be an array";
    }

    if (body.contacts.length > MAX_CONTACTS_PER_REQUEST) {
        return `Contacts cannot exceed ${MAX_CONTACTS_PER_REQUEST} entries`;
    }
    for (const contact of body.contacts) {
        if (typeof contact?.phone !== "string" || !contact.phone.trim()) {
            return "Contact phone number is required";
        }
    }

    return null;
};

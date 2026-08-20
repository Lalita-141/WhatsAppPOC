export interface SendPersonalMessageRequest {
    receiverUserOrganizationId: string;
    message: string;
}

export interface CheckContactsRequest {
    contacts: {
        name: string;
        phone: string;
    }[];
}

export const validateSendPersonalMessageRequest = (
    body: SendPersonalMessageRequest,
): string | null => {
    if (!body.receiverUserOrganizationId) {
        return "Receiver is required";
    }

    if (!body.message || !body.message.trim()) {
        return "Message is required";
    }

    if (body.message.trim().length > 5000) {
        return "Message cannot exceed 5000 characters";
    }

    return null;
};

// validate check contacts request

export const validateCheckContactsRequest = (
    body: CheckContactsRequest,
): string | null => {
    if (!body.contacts) {
        return "Contacts are required";
    }

    if (!Array.isArray(body.contacts)) {
        return "Contacts must be an array";
    }

    for (const contact of body.contacts) {
        if (!contact.phone || !contact.phone.trim()) {
            return "Contact phone number is required";
        }
    }

    return null;
};

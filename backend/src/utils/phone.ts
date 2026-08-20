export const normalizeIndianPhoneNumber = (
    phone: string,
): string => {
    // Remove spaces, brackets, hyphens, etc.
    let digits = phone.replace(/\D/g, "");

    // 919730700560 -> 9730700560
    if (digits.startsWith("91") && digits.length === 12) {
        digits = digits.substring(2);
    }

    // 09730700560 -> 9730700560
    if (digits.startsWith("0") && digits.length === 11) {
        digits = digits.substring(1);
    }

    if (digits.length !== 10) {
        throw new Error(
            `Invalid Indian mobile number: ${phone}`,
        );
    }

    return digits;
};
import prisma from "../../config/database.js";

export const findUsersByPhones = async (
    phones: {
        countryCode: string;
        mobileNo: string;
    }[],
) => {
    const numbersByCountry = new Map<string, string[]>();
    for (const phone of phones) {
        const numbers = numbersByCountry.get(phone.countryCode) ?? [];
        numbers.push(phone.mobileNo);
        numbersByCountry.set(phone.countryCode, numbers);
    }
    return await prisma.user_master.findMany({
        where: {
            deleted_at: null,
            OR: [...numbersByCountry.entries()].map(
                ([countryCode, mobileNumbers]) => ({
                    country_code: countryCode,
                    mobile_no: {
                        in: mobileNumbers,
                    },
                }),
            ),
        },
        select: {
            user_id: true,
            country_code: true,
            mobile_no: true,
            first_name: true,
            last_name: true,
            user_organization: {
                where: {
                    deleted_at: null,
                },
                select: {
                    user_organization_id: true,
                    org_id: true,
                },
            },
        },
    });
};
export const findActiveCountryCodes = async () => {
    return await prisma.country_master.findMany({
        where: {
            is_active: true,
            deleted_at: null,
        },
        select: {
            country_code: true,
            iso_code: true,
        },
    });
};
export const findUserCountryCode = async (userId: bigint) => {
    const user = await prisma.user_master.findUnique({
        where: {
            user_id: userId,
        },
        select: {
            country_code: true,
        },
    });
    return user?.country_code ?? null;
};
export const getUsersForChat = async (
    organizationId: bigint,
    currentUserId: bigint,
) => {
    return await prisma.user_master.findMany({
        where: {
            deleted_at: null,

            // Don't show myself
            user_id: {
                not: currentUserId,
            },

            // User must belong to same organization
            user_organization: {
                some: {
                    org_id: organizationId,
                    deleted_at: null,
                },
            },
        },

        select: {
            user_id: true,
            first_name: true,
            last_name: true,
            mobile_no: true,
            profile_photo: true,
            about: true,
            last_seen: true,

            user_organization: {
                where: {
                    org_id: organizationId,
                    deleted_at: null,
                },
                select: {
                    user_organization_id: true,
                    org_id: true,
                },
            },
        },

        orderBy: {
            first_name: "asc",
        },
    });
};
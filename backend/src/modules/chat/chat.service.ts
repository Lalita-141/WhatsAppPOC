import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { getUsersForChat } from "./chat.repository.js";
import { reachableOrganizations } from "../policy/communication.policy.js";
import { callingCodeDigits, normalizeContactPhone } from "../../utils/phone.js";
import {
    findActiveCountryCodes,
    findUserCountryCode,
    findUsersByPhones,
} from "./chat.repository.js";

// chcek contacts from phone
export const checkContacts = async (
    currentOrganizationId: bigint,
    currentUserId: bigint,
    contacts: {
        name: string;
        phone: string;
    }[],
) => {
    const countries = await findActiveCountryCodes();
    const ownCountryCode = await findUserCountryCode(currentUserId);
    const defaultIsoCode =
        countries.find(
            (country) => country.country_code === ownCountryCode,
        )?.iso_code ?? "IN";
    const storedCodeByCallingCode = new Map(
        countries.map((country) => [
            callingCodeDigits(country.country_code),
            country.country_code,
        ]),
    );
    const phoneKey = (countryCode: string, mobileNo: string) =>
        `${callingCodeDigits(countryCode)}:${mobileNo}`;
    // Normalize each contact once
    const normalizedContacts = contacts.map((contact) => ({
        contact,
        normalized: normalizeContactPhone(contact.phone, defaultIsoCode),
    }));
    const uniquePhones = new Map<
        string,
        { countryCode: string; mobileNo: string }
    >();
    for (const { normalized } of normalizedContacts) {
        const countryCode =
            normalized &&
            storedCodeByCallingCode.get(normalized.callingCode);
        if (normalized && countryCode) {
            uniquePhones.set(
                phoneKey(countryCode, normalized.nationalNumber),
                { countryCode, mobileNo: normalized.nationalNumber },
            );
        }
    }
    if (uniquePhones.size === 0) {
        throw new ApiError(
            400,
            "CONTACTS_REQUIRED",
            "At least one contact is required",
        );
    }
    // Find registered users
    const users =
        await findUsersByPhones([...uniquePhones.values()]);
    // Only members of organizations the caller may reach count as registered:
    // their own, plus any the organization policy allows. Membership elsewhere
    // is never revealed, including through the notRegistered list.
    const reachable = new Set(
        (await reachableOrganizations(currentOrganizationId)).map(String),
    );
    const orgNames = new Map(
        (await prisma.organization_master.findMany({
            where: { org_id: { in: [...reachable].map((id) => BigInt(id)) } },
            select: { org_id: true, organization_name: true },
        })).map((org) => [org.org_id.toString(), org.organization_name]),
    );
    const registered = users.flatMap((user) => {
        const organization =
            user.user_organization.find(
                (membership) => membership.org_id === currentOrganizationId && reachable.has(membership.org_id.toString()),
            ) ??
            user.user_organization.find((membership) =>
                reachable.has(membership.org_id.toString()),
            );
        if (!organization) {
            return [];
        }
        return [{
            key: phoneKey(user.country_code, user.mobile_no),
            userId: user.user_id.toString(),
            userOrganizationId:
                organization.user_organization_id.toString(),
            name: [user.first_name, user.last_name]
                .filter(Boolean)
                .join(" "),
            phone: user.mobile_no,
            organizationName:
                organization.org_id === currentOrganizationId
                    ? null
                    : orgNames.get(organization.org_id.toString()) ?? null,
        }];
    });
    const registeredKeys = new Set(
        registered.map((user) => user.key),
    );
    const notRegistered = normalizedContacts
        .filter(({ normalized }) => {
            return !(
                normalized &&
                registeredKeys.has(
                    phoneKey(normalized.callingCode, normalized.nationalNumber),
                )
            );
        })
        .map(({ contact }) => ({
            name: contact.name,
            phone: contact.phone,
        }));
    return {
        registered: registered.map(({ key: _key, ...user }) => user),
        notRegistered,
    };
};
//form get chat list 
export const getChatContacts = async (
    organizationId: bigint,
    currentUserId: bigint,
) => {

    const users = await getUsersForChat(
        organizationId,
        currentUserId,
    );

    return users.map((user) => {

        const organization =
            user.user_organization[0];

        return {
            userId: user.user_id.toString(),

            userOrganizationId:
                organization?.user_organization_id.toString(),

            firstName: user.first_name,

            lastName: user.last_name,

            name: [
                user.first_name,
                user.last_name,
            ]
                .filter(Boolean)
                .join(" "),

            mobileNo: user.mobile_no,

            profilePhoto: user.profile_photo,

            about: user.about,

            lastSeen: user.last_seen,
        };
    });
};
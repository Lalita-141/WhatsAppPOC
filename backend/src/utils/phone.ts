import {
  CountryCode,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { ApiError } from "./api-error.js";

export interface NormalizedPhone {
  nationalNumber: string;
  callingCode: string;
  e164: string;
}

const parsePhone = (
  phone: string,
  isoCode: string,
): NormalizedPhone | null => {
  try {
    const parsed = parsePhoneNumberFromString(
      phone,
      isoCode.toUpperCase() as CountryCode,
    );

    if (!parsed || !parsed.isPossible()) {
      return null;
    }

    return {
      nationalNumber: parsed.nationalNumber,
      callingCode: parsed.countryCallingCode,
      e164: parsed.number,
    };
  } catch {
    return null;
  }
};

/**
 * Normalizes a number typed for one selected country. The number must belong
 * to that country, so "+1..." cannot be verified while India is selected.
 */
export const normalizePhoneForCountry = (
  phone: string,
  isoCode: string,
): NormalizedPhone => {
  const normalized = parsePhone(phone, isoCode);

  if (
    !normalized ||
    normalized.callingCode !==
      getCountryCallingCode(isoCode.toUpperCase() as CountryCode)
  ) {
    throw new ApiError(
      400,
      "INVALID_MOBILE_NUMBER",
      "Invalid mobile number for the selected country",
    );
  }

  return normalized;
};

/**
 * Normalizes an address-book entry, which may or may not carry a country
 * prefix. Numbers without a prefix use the owner's country.
 */
export const normalizeContactPhone = (
  phone: string,
  defaultIsoCode: string,
): NormalizedPhone | null => parsePhone(phone, defaultIsoCode);

export const callingCodeDigits = (countryCode: string) =>
  countryCode.replace(/\D/g, "");

export interface ProfileSetupRequest {
  orgCode: string;
  countryId: string;
  mobileNo: string;
  firstName: string;
  lastName?: string;
  about?: string;
}

export interface ProfileUpdateRequest {
  first_name?: string;
  last_name?: string;
  about?: string;
}

export const validateProfileSetupRequest = (
  body: ProfileSetupRequest,
): string | null => {
  if (!body.orgCode?.trim()) {
    return "Organization code is required";
  }

  if (!body.countryId?.trim()) {
    return "Country is required";
  }

  if (!body.mobileNo?.trim()) {
    return "Mobile number is required";
  }

  if (!/^\d{6,15}$/.test(body.mobileNo)) {
    return "Invalid mobile number";
  }

  if (!body.firstName?.trim()) {
    return "First name is required";
  }

  if (body.firstName.trim().length > 100) {
    return "First name cannot exceed 100 characters";
  }

  if (body.lastName && body.lastName.trim().length > 100) {
    return "Last name cannot exceed 100 characters";
  }

  if (body.about && body.about.trim().length > 500) {
    return "About cannot exceed 500 characters";
  }

  return null;
};

export const validateProfileUpdateRequest = (
  body: ProfileUpdateRequest,
): string | null => {
  // Check if request body is empty
  if (!body || Object.keys(body).length === 0) {
    return "At least one profile field is required";
  }

  // Allow only these fields
  const allowedFields = ["first_name", "last_name", "about"];

  const invalidFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field),
  );

  if (invalidFields.length > 0) {
    return `Invalid field(s): ${invalidFields.join(", ")}`;
  }

  // First name validation
  if (body.first_name !== undefined) {
    if (typeof body.first_name !== "string") {
      return "First name must be a string";
    }

    if (body.first_name.trim().length === 0) {
      return "First name cannot be empty";
    }

    if (body.first_name.trim().length > 100) {
      return "First name cannot exceed 100 characters";
    }
  }

  // Last name validation
  if (body.last_name !== undefined) {
    if (typeof body.last_name !== "string") {
      return "Last name must be a string";
    }

    if (body.last_name.trim().length === 0) {
      return "Last name cannot be empty";
    }

    if (body.last_name.trim().length > 100) {
      return "Last name cannot exceed 100 characters";
    }
  }

  // About validation
  if (body.about !== undefined) {
    if (typeof body.about !== "string") {
      return "About must be a string";
    }

    if (body.about.trim().length > 500) {
      return "About cannot exceed 500 characters";
    }
  }

  return null;
};
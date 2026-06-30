/**
 * Small helpers for reading values out of a submitted `FormData` in Server
 * Actions. Numeric fields are passed through as strings — the API validates
 * and coerces them.
 */

export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getOptionalString(
  formData: FormData,
  key: string,
): string | undefined {
  const value = getString(formData, key);
  return value === "" ? undefined : value;
}

export function getBoolean(formData: FormData, key: string): boolean {
  return getString(formData, key) === "true";
}

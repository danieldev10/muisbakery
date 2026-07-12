export const internalApiSecretHeader = "x-muisbakery-internal-secret";

export function getInternalApiHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_API_SECRET;

  return secret
    ? {
        [internalApiSecretHeader]: secret,
      }
    : {};
}

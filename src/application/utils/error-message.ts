export function errorMessage(
  error: unknown,
  fallback: string | ((value: unknown) => string),
): string {
  if (error instanceof Error) return error.message;
  return typeof fallback === "function" ? fallback(error) : fallback;
}

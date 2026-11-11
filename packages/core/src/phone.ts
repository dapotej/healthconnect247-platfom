/**
 * Normalise a Nigerian phone number to E.164 (+234 followed by 10 digits).
 *
 * Accepts the forms people actually type: "0803 456 7812", "+234 803 456 7812",
 * "2348034567812", "803-456-7812". Returns null for anything else.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let national: string;
  if (digits.length === 13 && digits.startsWith('234')) national = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 10 && !digits.startsWith('0')) national = digits;
  else return null;
  if (national.startsWith('0')) return null;
  return `+234${national}`;
}

/** "+234 803 *** **12" — safe to show in lists and the client portal. */
export function maskPhone(e164: string): string {
  const national = e164.replace(/^\+234/, '');
  if (national.length !== 10) return '***';
  return `+234 ${national.slice(0, 3)} *** **${national.slice(8)}`;
}

export class InputError extends Error {}

export const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function headOk(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    return (await fetch(url, { method: "HEAD", signal })).ok;
  } catch (err) {
    if (signal.aborted) throw err;
    return false;
  }
}

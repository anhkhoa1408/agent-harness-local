export const json = (value: unknown): string => JSON.stringify(value ?? null);
export type RecordBodyRow = { body: string };

export interface RuntimePort {
  now(): number;
  id(): string;
  bootIdentity(): string | null;
  pid: number;
  sleep(ms: number): Promise<void>;
  every(ms: number, work: () => void): () => void;
}
export type Lease = { owner: string; epoch: number; expiresAt: number };

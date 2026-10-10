export const workerEvent = (type: string, data: unknown = {}) => ({
  type,
  data,
});

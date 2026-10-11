export class ExecutionMode {
  private constructor() {}
  static readonly MANUAL = "manual" as const;
  static readonly AUTO = "auto" as const;
  static readonly ALL = [ExecutionMode.MANUAL, ExecutionMode.AUTO] as const;
}

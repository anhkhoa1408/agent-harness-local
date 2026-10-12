export class ModelDefaults {
  private constructor() {}
  static readonly PLANNER_MODEL = "gpt-6-astra" as const;
  static readonly WORKER_MODEL = "gpt-6-luna" as const;
  static readonly PLANNING_EFFORT = "high" as const;
  static readonly EXECUTION_EFFORT = "medium" as const;
  static readonly PARENT = {
    model: ModelDefaults.WORKER_MODEL,
    effort: ModelDefaults.EXECUTION_EFFORT,
  };
}

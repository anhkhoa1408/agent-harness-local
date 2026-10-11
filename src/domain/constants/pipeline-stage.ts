export class PipelineStage {
  private constructor() {}
  static readonly DISCOVER = "discover" as const;
  static readonly ANALYZE = "analyze" as const;
  static readonly PLAN = "plan" as const;
  static readonly PREPARE = "prepare" as const;
  static readonly IMPLEMENT = "implement" as const;
  static readonly VERIFY = "verify" as const;
  static readonly REVIEW = "review" as const;
  static readonly REPAIR = "repair" as const;
  static readonly DELIVER = "deliver" as const;
  static readonly ALL = [
    PipelineStage.DISCOVER,
    PipelineStage.ANALYZE,
    PipelineStage.PLAN,
    PipelineStage.PREPARE,
    PipelineStage.IMPLEMENT,
    PipelineStage.VERIFY,
    PipelineStage.REVIEW,
    PipelineStage.REPAIR,
    PipelineStage.DELIVER,
  ] as const;
  static readonly AI = [
    PipelineStage.DISCOVER,
    PipelineStage.ANALYZE,
    PipelineStage.PLAN,
    PipelineStage.IMPLEMENT,
    PipelineStage.REVIEW,
    PipelineStage.REPAIR,
  ] as const;
}

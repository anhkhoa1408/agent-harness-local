export class ExecutionErrorCode {
  private constructor() {}
  static readonly INVALID_JUNIT = "invalid_junit" as const;
  static readonly UNSAFE_ENVIRONMENT = "unsafe_environment" as const;
  static readonly SCREENSHOT_OVERWRITES_SOURCE =
    "screenshot_overwrites_source" as const;
  static readonly UI_IMAGE_TOO_LARGE = "ui_image_too_large" as const;
  static readonly UI_INVALID_PNG = "ui_invalid_png" as const;
  static readonly UI_E2E_NOT_PASSED = "ui_e2e_not_passed" as const;
  static readonly UI_VIEWPORT_MISMATCH = "ui_viewport_mismatch" as const;
  static readonly UI_EVIDENCE_MISSING = "ui_evidence_missing" as const;
  static readonly UI_EVIDENCE_CHANGED = "ui_evidence_changed" as const;
  static readonly REPORT_TOO_LARGE = "report_too_large" as const;
}

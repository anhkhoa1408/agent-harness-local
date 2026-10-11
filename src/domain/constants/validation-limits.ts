export class ValidationLimits {
  private constructor() {}
  static readonly MAX_TITLE_CHARACTERS = 200;
  static readonly MAX_REQUIREMENT_CHARACTERS = 100_000;
  static readonly MAX_COMMAND_ID_CHARACTERS = 200;
  static readonly MIN_CHECK_TIMEOUT_MS = 100;
  static readonly MAX_CHECK_TIMEOUT_MS = 3_600_000;
  static readonly MAX_SCREENSHOT_ID_CHARACTERS = 80;
  static readonly MAX_VIEWPORT_PIXELS = 3840;
  static readonly MAX_SELECTED_SCREENSHOTS = 6;
  static readonly MAX_VISUAL_EVIDENCE_CHARACTERS = 2000;
  static readonly MAX_STORY_ID_CHARACTERS = 100;
  static readonly MAX_PLAN_COMMENT_CHARACTERS = 10_000;
}

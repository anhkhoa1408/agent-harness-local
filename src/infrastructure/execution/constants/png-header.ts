export class PngHeader {
  private constructor() {}
  static readonly MINIMUM_BYTES = 24;
  static readonly SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
  static readonly CHUNK_TYPE_START = 12;
  static readonly CHUNK_TYPE_END = 16;
  static readonly CHUNK_TYPE = "IHDR" as const;
  static readonly WIDTH_OFFSET = 16;
  static readonly HEIGHT_OFFSET = 20;
}

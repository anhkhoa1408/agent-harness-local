import { ApplicationErrorCode } from "../constants/index";
import type { ApplicationStore } from "../ports";
export interface ArtifactReaderPort {
  read(path: string, screenshot: boolean): Promise<string | ArrayBuffer>;
}
export class ArtifactService {
  constructor(
    private readonly data: Pick<ApplicationStore, "artifacts">,
    private readonly files: ArtifactReaderPort,
  ) {}
  async read(id: string) {
    const record = this.data.artifacts.get(id);
    if (!record) throw new Error(ApplicationErrorCode.ARTIFACT_NOT_FOUND);
    const screenshot = record.type === "screenshot";
    return { body: await this.files.read(record.path, screenshot), screenshot };
  }
}

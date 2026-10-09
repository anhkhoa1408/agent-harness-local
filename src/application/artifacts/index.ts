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
    if (!record) throw new Error("artifact_not_found");
    const screenshot = record.type === "screenshot";
    return { body: await this.files.read(record.path, screenshot), screenshot };
  }
}

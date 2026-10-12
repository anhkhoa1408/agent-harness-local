import { RepositoriesErrorCode } from "./constants/repositories-error-code";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inspectRepository } from "./inspect";
import type {
  RepositoryRegistrationPort,
  RepositoryArtifactPort,
} from "../../application/repositories";
export const registration: RepositoryRegistrationPort = {
  inspect: (input) =>
    inspectRepository(input.path, input.baseBranch, input.remote),
};
export function repositoryArtifacts(data: string): RepositoryArtifactPort {
  return {
    removeTaskArtifacts(id) {
      const artifacts = resolve(join(data, "artifacts"));
      const path = resolve(artifacts, id);
      if (dirname(path) !== artifacts)
        throw new Error(RepositoriesErrorCode.INVALID_ARTIFACT_PATH);
      rmSync(path, { recursive: true, force: true });
    },
  };
}

import { SystemLimits } from "./constants/system-limits";
import { ApplicationErrorCode } from "../../application/constants/index";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = `
try
  return POSIX path of (choose folder with prompt "Chọn thư mục repository")
on error number -128
  return ""
end try`;

export function createFolderPicker(
  platform: string = process.platform,
  run: () => Promise<{ stdout: string }> = () =>
    exec("/usr/bin/osascript", ["-e", script], {
      timeout: SystemLimits.FOLDER_PICKER_TIMEOUT_MS,
      maxBuffer: SystemLimits.CLI_STATUS_MAX_BUFFER_BYTES,
    }),
) {
  let busy = false;
  return async (): Promise<string | null> => {
    if (platform !== "darwin")
      throw new Error(ApplicationErrorCode.FOLDER_PICKER_UNSUPPORTED);
    if (busy) throw new Error(ApplicationErrorCode.FOLDER_PICKER_BUSY);
    busy = true;
    try {
      const { stdout } = await run();
      const path = stdout.replace(/\r?\n$/, "");
      if (!path) return null;
      return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    } catch {
      throw new Error(ApplicationErrorCode.FOLDER_PICKER_FAILED);
    } finally {
      busy = false;
    }
  };
}

export const pickFolder = createFolderPicker();

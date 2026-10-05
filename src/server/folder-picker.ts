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
      timeout: 120000,
      maxBuffer: 16384,
    }),
) {
  let busy = false;
  return async (): Promise<string | null> => {
    if (platform !== "darwin") throw new Error("folder_picker_unsupported");
    if (busy) throw new Error("folder_picker_busy");
    busy = true;
    try {
      const { stdout } = await run();
      const path = stdout.replace(/\r?\n$/, "");
      if (!path) return null;
      return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    } catch {
      throw new Error("folder_picker_failed");
    } finally {
      busy = false;
    }
  };
}

export const pickFolder = createFolderPicker();

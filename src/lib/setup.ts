/**
 * Helpers for setting up and managing a user's local environment
 */

import { ToolNames } from "@/types";
import { installedToolVersion } from "./shell";
import picocolors from "picocolors";
import shellExec from "shell-exec";
import { PathSourceStatus } from "@/const/setup";

/**
 * Check for each of the installed tools on the user system
 */
export async function checkInstalledTools({
  outputToolStatus = false,
}: {
  outputToolStatus?: boolean;
} = {}) {
  // default to true since we set to false if any single tool is not installed
  let allInstalled = true;

  let status: { [key in ToolNames]: string | boolean } = {
    rust: false,
    solana: false,
    avm: false,
    anchor: false,
    node: false,
    yarn: false,
    trident: false,
    zest: false,
    "cargo-update": false,
    verify: false,
  };

  await Promise.all(
    Object.keys(status).map(async (tool: ToolNames) => {
      const version = await installedToolVersion(tool);
      status[tool] = version;
      if (!status[tool]) allInstalled = false;
    }),
  );

  if (outputToolStatus) {
    let noteContent = "";
    for (const command in status) {
      if (Object.prototype.hasOwnProperty.call(status, command)) {
        noteContent += "- ";
        if (status[command]) {
          noteContent += picocolors.green(command);
        } else {
          noteContent += picocolors.red(command);
        }
        noteContent += ` ${status[command] || "(not installed)"}\n`;
      }
    }
    console.log(noteContent.trim(), "\n");
  }

  return {
    allInstalled,
    status,
  };
}

/**
 * Check if a given command is available in the current terminal session or required a refresh to update the PATH
 */
export async function checkShellPathSource(
  cmd: string,
  pathSource: string,
): Promise<PathSourceStatus> {
  const [withoutPath, withPath] = await Promise.allSettled([
    // comment for better diffs
    shellExec(cmd),
    shellExec(`export PATH="${pathSource}:$PATH" && ${cmd}`),
  ]);
  // console.log(withoutPath);
  // console.log(withPath);

  if (withoutPath.status == "fulfilled" && withPath.status == "fulfilled") {
    // the original command worked
    if (withoutPath.value.code === 0) {
      if (
        withoutPath.value.stdout.toLowerCase() ==
        withPath.value.stdout.toLowerCase()
      ) {
        // console.log("The command worked!");
        return PathSourceStatus.SUCCESS;
      }

      // console.log("The values were different");
      return PathSourceStatus.OUTPUT_MISMATCH;
    }
    // the command worked with the injected pathSource
    else if (withPath.value.code === 0) {
      // console.log("Missing the path");
      return PathSourceStatus.MISSING_PATH;
    }
    // if (withoutPath.value.stdout.toLowerCase() == withPath.value.stdout.toLowerCase())
  }

  return PathSourceStatus.FAILED;
}

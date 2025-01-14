export type PlatformOS = "unknown" | "linux" | "mac" | "windows";

export type ToolNames =
  | "rust"
  | "solana"
  | "avm"
  | "anchor"
  | "node"
  | "yarn"
  | "zest"
  | "cargo-update"
  | "verify"
  | "trident";

export type ToolCommandConfig = {
  /** $PATH location for the command's tools */
  pathSource?: string;
  /** command to get the tool version */
  version: string;
  /** command to install the tool */
  // install: string;
  /** command to update the tool */
  // update: string;
  dependencies?: ToolNames[];
};

export type PlatformToolsVersions = Partial<{
  rustc: string;
  "platform-tools": string;
  "build-sbf": string;
}>;

/**
 *
 */
export type InstallCommandPropsBase = {
  /**  */
  os?: PlatformOS;
  /**  */
  version?: string;
  /**  */
  verbose?: boolean;
  /**  */
  verifyParentCommand?: boolean;
  /**  */
  updateAvailable?: PackageUpdate | undefined;

  /**
   * Reference to an existing `spinner`
   */
  // spinner: ReturnType<typeof spinner>;
};

export type ShellExecInSessionArgs = {
  command: string;
  args?: string[];
  outputOnly?: boolean;
};

export type PackageUpdate = {
  name: string;
  installed: string | false;
  latest: string;
  needsUpdate: boolean;
};

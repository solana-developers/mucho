import { ToolCommandConfig, ToolNames } from "@/types";

export const TOOL_CONFIG: { [key in ToolNames]: ToolCommandConfig } = {
  node: {
    version: "node --version",
  },
  rust: {
    pathSource: "$HOME/.cargo/env",
    version: "rustc --version",
  },
  solana: {
    dependencies: ["rust"],
    pathSource: "$HOME/.local/share/solana/install/active_release/bin",
    version: "solana --version",
  },
  avm: {
    dependencies: ["rust"],
    version: "avm --version",
  },
  anchor: {
    dependencies: ["avm"],
    version: "anchor --version",
  },
  yarn: {
    version: "yarn --version",
  },
  trident: {
    dependencies: ["rust"],
    // the trident cli does not have a version command, so we grab it from cargo
    version: "cargo install --list | grep trident-cli",
  },
  zest: {
    dependencies: ["rust"],
    // the zest cli does not have a version command, so we grab it from cargo
    version: "cargo install --list | grep zest",
  },
  "cargo-update": {
    dependencies: ["rust"],
    version: "cargo install --list | grep cargo-update",
  },
  verify: {
    dependencies: ["rust"],
    version: "solana-verify --version",
  },
};

export enum PathSourceStatus {
  SUCCESS,
  FAILED,
  OUTPUT_MISMATCH,
  MISSING_PATH,
}

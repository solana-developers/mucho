import { Command } from "@commander-js/extra-typings";
import { cliOutputConfig } from "@/lib/cli";
import { getAppInfo } from "@/lib/app-info";
import { getCommandOutputSync } from "@/lib/shell";
import { getPlatformToolsVersions } from "@/lib/solana";
import { TOOL_CONFIG } from "@/const/setup";

export function cliProgramRoot() {
  // console.log(picocolors.bgMagenta(` ${app.name} - v${app.version} `));

  // initialize the cli commands and options parsing
  const program = new Command()
    .name(`mucho`)
    .configureOutput(cliOutputConfig)
    .description("mucho tools, one cli")
    .option("--version", "output the version number of this tool", async () => {
      console.log("mucho", getAppInfo().version);

      if (process.argv.indexOf("--version") === 2) {
        console.log(
          getCommandOutputSync(TOOL_CONFIG.rust.version) || `rustc not found`,
        );
        console.log(
          "node",
          getCommandOutputSync(TOOL_CONFIG.node.version) ||
            "not found (odd if you are running this node tool...)",
        );

        console.log(
          getCommandOutputSync(TOOL_CONFIG.solana.version) ||
            `solana cli not found`,
        );

        const solanaTools = getPlatformToolsVersions();
        console.log("solana platform tools:");
        for (const key in solanaTools) {
          console.log("  " + key + ": " + solanaTools[key]);
        }

        console.log("\nFor more info run: 'npx mucho info'");
      }
      process.exit(0);
    });

  return program;
}

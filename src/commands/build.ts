import { join } from "path";
import { Command, Option } from "@commander-js/extra-typings";
import { cliOutputConfig } from "@/lib/cli";
import { titleMessage, warningOutro, warnMessage } from "@/lib/logs";
import {
  checkCommand,
  installedToolVersion,
  shellExecInSession,
} from "@/lib/shell";
import { COMMON_OPTIONS } from "@/const/commands";
import { autoLocateProgramsInWorkspace, loadCargoToml } from "@/lib/cargo";
import { buildProgramCommand } from "@/lib/shell/build";
import { doesFileExist } from "@/lib/utils";
import { isVersionNewer } from "@/lib/node";
import { getPlatformToolsVersions } from "@/lib/solana";

/**
 * Command: `build`
 *
 * Build the programs located in the user's repo
 */
export function buildCommand() {
  return new Command("build")
    .configureOutput(cliOutputConfig)
    .description("build your Solana programs")
    .usage("[options] [-- <CARGO_ARGS>...]")
    .addOption(
      new Option(
        "-- <CARGO_ARGS>",
        `arguments to pass to the underlying 'cargo build-sbf' command`,
      ),
    )
    .addOption(
      new Option(
        "-p --program-name <PROGRAM_NAME>",
        "name of the program to build",
      ),
    )
    .addOption(COMMON_OPTIONS.manifestPath)
    .addOption(COMMON_OPTIONS.config)
    .addOption(COMMON_OPTIONS.outputOnly)
    .action(async (options, { args: passThroughArgs }) => {
      if (!options.outputOnly) {
        titleMessage("Build your Solana programs");
      }

      // console.log("options:");
      // console.log(options);

      await checkCommand("cargo build-sbf --help", {
        exit: true,
        message:
          "Unable to detect the 'cargo build-sbf' command. Do you have it installed?",
      });

      let { programs, cargoToml } = autoLocateProgramsInWorkspace(
        options.manifestPath,
      );

      // only build a single program
      if (options.programName) {
        if (
          programs.has(options.programName) &&
          doesFileExist(programs.get(options.programName))
        ) {
          cargoToml = loadCargoToml(programs.get(options.programName));
        } else {
          warnMessage(
            `Unable to locate program '${options.programName}' in this workspace`,
          );
          console.log(`The following programs were located:`);

          programs.forEach((_programPath, programName) =>
            console.log(" -", programName),
          );

          // todo: should we prompt the user to select a valid program?
          process.exit();
        }
      }

      if (!cargoToml) {
        return warningOutro(
          `Unable to locate Cargo.toml file. Operation canceled.`,
        );
      }

      let buildCommand: null | string = null;

      let toolsVersion: string | null = null;
      const solanaVersion = await installedToolVersion("solana");
      const solanaTools = getPlatformToolsVersions();

      if (
        isVersionNewer(solanaVersion || "", "2.0") &&
        !isVersionNewer(solanaTools["platform-tools"], "1.43")
      ) {
        warnMessage(
          `cargo build-sbf versions >=2.X requires building with platform tools version >=1.43`,
        );
        toolsVersion = "1.43";
        warnMessage(
          `Auto setting platform tools to ${toolsVersion} for this build`,
        );
      }

      if (cargoToml.workspace) {
        console.log("Building all programs in the workspace");
        buildCommand = buildProgramCommand({
          // no manifest file will attempt to build the whole workspace
          manifestPath: cargoToml.configPath,
          workspace: true,
          toolsVersion,
        });
      } else if (
        cargoToml.package &&
        cargoToml.lib["crate-type"].includes("lib")
      ) {
        console.log(
          `Building program '${
            cargoToml.lib.name || cargoToml.package.name || "[unknown]"
          }' only`,
        );

        buildCommand = buildProgramCommand({
          // a single program manifest will build only that one program
          manifestPath: cargoToml.configPath,
          toolsVersion,
        });
      } else {
        return warningOutro(`Unable to locate any program's Cargo.toml file`);
      }

      if (!buildCommand) {
        return warningOutro(`Unable to create build command`);
      }

      shellExecInSession({
        command: buildCommand,
        args: passThroughArgs,
        outputOnly: options.outputOnly,
      });
    });
}

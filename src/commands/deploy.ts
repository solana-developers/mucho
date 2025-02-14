import path from "path";
import { Command, Option } from "@commander-js/extra-typings";
import { cliConfig, COMMON_OPTIONS } from "@/const/commands";
import { cliOutputConfig, loadConfigToml } from "@/lib/cli";
import { cancelMessage, titleMessage, warnMessage } from "@/lib/logs";
import { checkCommand, shellExecInSession } from "@/lib/shell";
import {
  buildDeployProgramCommand,
  getDeployedProgramInfo,
} from "@/lib/shell/deploy";
import { autoLocateProgramsInWorkspace } from "@/lib/cargo";
import { directoryExists, doesFileExist } from "@/lib/utils";
import { getSafeClusterMoniker, parseRpcUrlOrMoniker } from "@/lib/solana";
import { promptToSelectCluster } from "@/lib/prompts/build";
import { loadKeypairSignerFromFile } from "gill/node";

/**
 * Command: `deploy`
 *
 * Manage Solana program deployments and upgrades
 */
export function deployCommand() {
  return new Command("deploy")
    .configureOutput(cliOutputConfig)
    .description("deploy a Solana program")
    .usage("[options] [-- <DEPLOY_ARGS>...]")
    .addOption(
      new Option(
        "-- <DEPLOY_ARGS>",
        `arguments to pass to the underlying 'solana program' command`,
      ),
    )
    .addOption(
      new Option(
        "-p --program-name <PROGRAM_NAME>",
        "name of the program to deploy",
      ),
    )
    .addOption(COMMON_OPTIONS.url)
    .addOption(COMMON_OPTIONS.manifestPath)
    .addOption(COMMON_OPTIONS.keypair)
    .addOption(COMMON_OPTIONS.config)
    .addOption(COMMON_OPTIONS.outputOnly)
    .addOption(COMMON_OPTIONS.priorityFee)
    .action(async (options, { args: passThroughArgs }) => {
      if (!options.outputOnly) {
        titleMessage("Deploy a Solana program");
      }

      await checkCommand("solana program --help", {
        exit: true,
        message: "Unable to detect the 'solana program' command",
      });

      const { programs, cargoToml } = autoLocateProgramsInWorkspace(
        options.manifestPath,
      );

      // auto select the program name for single program repos
      if (!options.programName && programs.size == 1) {
        options.programName = programs.entries().next().value[0];
      }

      if (!cargoToml) return warnMessage(`Unable to locate Cargo.toml`);

      // ensure the selected program directory exists in the workspace
      if (!programs.has(options.programName) || !options.programName) {
        if (!options.programName) {
          // todo: we could give the user a prompt
          warnMessage(`You must select a program to deploy. See --help.`);
        } else if (!programs.has(options.programName)) {
          warnMessage(
            `Unable to locate program '${options.programName}' in this workspace`,
          );
        }

        console.log(`The following programs were located:`);
        programs.forEach((_programPath, programName) =>
          console.log(" -", programName),
        );

        // todo: should we prompt the user to select a valid program?
        process.exit();
      }

      if (!options.url) {
        const cluster = await promptToSelectCluster(
          "Select the cluster to deploy your program on?",
          getSafeClusterMoniker(cliConfig?.json_rpc_url) || undefined,
        );
        options.url = parseRpcUrlOrMoniker(cluster);
      }

      if (!options.url) {
        return warnMessage(`You must select cluster to deploy to. See --help`);
      }

      let selectedCluster = getSafeClusterMoniker(options.url);
      if (!selectedCluster) {
        // prompting a second time will allow users to use a custom rpc url
        const cluster = await promptToSelectCluster(
          "Unable to auto detect the cluster to deploy too. Select a cluster?",
        );
        selectedCluster = getSafeClusterMoniker(cluster);
        if (!selectedCluster) {
          return warnMessage(
            `Unable to detect cluster to deploy to. Operation canceled.`,
          );
        }
      }

      let config = loadConfigToml(
        options.config,
        options,
        false /* config not required */,
      );

      const buildDir = path.join(
        path.dirname(cargoToml.configPath),
        "target",
        "deploy",
      );

      if (!directoryExists(buildDir)) {
        warnMessage(`Unable to locate your build dir: ${buildDir}`);
        return warnMessage(`Have you built your programs?`);
      }

      const binaryPath = path.join(buildDir, `${options.programName}.so`);
      if (!doesFileExist(binaryPath)) {
        // todo: we should detect if the program is declared and recommend building it
        // todo: or we could generate a fresh one?
        warnMessage(`Unable to locate program binary:\n${binaryPath}`);
        return warnMessage(`Have you built your programs?`);
      }

      let programId: string | null = null;
      let programIdPath: string | null = path.join(
        buildDir,
        `${options.programName}-keypair.json`,
      );
      const programKeypair = await loadKeypairSignerFromFile(programIdPath);

      // process the user's config file if they have one
      if (config?.programs) {
        // make sure the user has the cluster program declared
        if (!getSafeClusterMoniker(selectedCluster, config.programs)) {
          warnMessage(
            `Unable to locate '${selectedCluster}' programs in your Solana.toml`,
          );

          console.log("The following programs are declared:");
          Object.keys(config.programs).forEach((cl) => {
            console.log(` - ${cl}:`);
            Object.keys(config.programs[cl]).forEach((name) => {
              console.log(`    - ${name}`);
            });
          });

          process.exit();
        }

        if (
          !config?.programs?.[selectedCluster] ||
          !Object.hasOwn(config.programs[selectedCluster], options.programName)
        ) {
          warnMessage(
            `Program '${options.programName}' not found in 'programs.${selectedCluster}'`,
          );
          process.exit();
        }

        programId = config.programs[selectedCluster][options.programName];
      } else {
        // if the user does not have a config file, we will try to auto detect the program id to use
        // todo: this

        if (programKeypair) {
          programId = programKeypair.address;
          warnMessage(`Auto detected default program keypair file:`);
          console.log(` - keypair path: ${programIdPath}`);
          console.log(` - program id: ${programId}`);
        } else {
          warnMessage(`Unable to locate any program id or program keypair.`);
          process.exit();
        }
      }

      if (!programId) {
        return warnMessage(
          `Unable to locate program id for '${options.programName}'. Do you have it declared?`,
        );
      }

      let programInfo = await getDeployedProgramInfo(programId, options.url);

      /**
       * when programInfo exists, we assume the program is already deployed
       * (either from the user's current machine or not)
       */
      if (!programInfo) {
        // not-yet-deployed programs require a keypair to deploy for the first time
        // warnMessage(
        //   `Program ${options.programName} (${programId}) is NOT already deployed on ${selectedCluster}`,
        // );
        if (!programKeypair) {
          return warnMessage(
            `Unable to locate program keypair: ${programIdPath}`,
          );
        }

        const programIdFromKeypair = programKeypair.address;
        /**
         * since the initial deployment requires a keypair:
         * if the user has a mismatch between their declared program id
         * and the program keypair, we do not explicitly know which address they want
         */
        if (programIdFromKeypair !== programId) {
          warnMessage(
            `The loaded program keypair does NOT match the configured program id`,
          );
          console.log(` - program keypair: ${programIdFromKeypair}`);
          console.log(` - declared program id: ${programId}`);
          warnMessage(
            `Unable to perform initial program deployment. Operation cancelled.`,
          );
          process.exit();
          // todo: should we prompt the user if they want to proceed
        }
        programId = programIdFromKeypair;
        programInfo = await getDeployedProgramInfo(programId, options.url);
      }

      const authorityKeypair = await loadKeypairSignerFromFile(
        config.settings.keypair,
      );

      /**
       * todo: assorted pre-deploy checks to add
       * + is program already deployed
       * + is program frozen
       * - do you have the upgrade authority
       * - is the upgrade authority a multi sig?
       * - do you have enough sol to deploy ?
       */
      if (programInfo) {
        if (!programInfo.authority) {
          return cancelMessage(
            `Program ${programInfo.programId} is no longer upgradeable`,
          );
        }

        if (programInfo.authority !== authorityKeypair.address) {
          return cancelMessage(
            `Your keypair (${authorityKeypair.address}) is not the upgrade authority for program ${programId}`,
          );
        }

        programId = programInfo.programId;
      } else {
        // todo: do we need to perform any checks if the program is not already deployed?
      }

      const command = buildDeployProgramCommand({
        programPath: binaryPath,
        programId: programIdPath || programId,
        url: options.url,
        keypair: options.keypair,
        priorityFee: options.priorityFee,
      });

      // todo: if options.url is localhost, verify the test validator is running

      // todo: if localhost deploy, support feature cloning to match a cluster

      /**
       * todo: if deploying to mainnet, we should add some "confirm" prompts
       * - this is the program id
       * - this is the upgrade authority
       * - estimated cost (you have X sol)
       * do you want to continue?
       */

      shellExecInSession({
        command,
        args: passThroughArgs,
        outputOnly: options.outputOnly,
      });
    });
}

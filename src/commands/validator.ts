import { Command, Option } from "@commander-js/extra-typings";
import { cliOutputConfig, loadConfigToml } from "@/lib/cli";
import { titleMessage, warnMessage } from "@/lib/logs";
import {
  checkCommand,
  getCommandOutputSync,
  shellExecInSession,
} from "@/lib/shell";
import {
  deepMerge,
  doesFileExist,
  loadFileNamesToMap,
  updateGitignore,
} from "@/lib/utils";
import { buildTestValidatorCommand } from "@/lib/shell/test-validator";
import { COMMON_OPTIONS } from "@/const/commands";
import { DEFAULT_CACHE_DIR, DEFAULT_TEST_LEDGER_DIR } from "@/const/solana";
import { deconflictAnchorTomlWithConfig, loadAnchorToml } from "@/lib/anchor";
import { validateExpectedCloneCounts } from "@/lib/shell/clone";
import { promptToAutoClone } from "@/lib/prompts/clone";
import { listLocalPrograms } from "@/lib/programs";
import { cloneCommand } from "@/commands/clone";
import { getAppInfo } from "@/lib/app-info";
import { getExplorerLink } from "@/lib/web3";
import { loadKeypairSignerFromFile } from "gill/node";

/**
 * Command: `validator`
 *
 * Run the 'solana-test-validator' on your local machine
 */
export function validatorCommand() {
  // special handle getting the test validator version
  if (
    process.argv.length === 4 &&
    process.argv[2].toLowerCase() == "validator" &&
    process.argv[3].toLowerCase() == "--version"
  ) {
    console.log("mucho", getAppInfo().version);
    console.log(
      getCommandOutputSync("solana-test-validator --version") ||
        `solana-test-validator not found`,
    );
    process.exit();
  }

  return new Command("validator")
    .allowUnknownOption(true)
    .addHelpText(
      "afterAll",
      "Additional Options:\n" + "  see 'solana-test-validator --help'",
    )
    .configureOutput(cliOutputConfig)
    .description("run the Solana test validator on your local machine")
    .addOption(
      new Option(
        "--reset",
        "reset the test validator to genesis, reloading all preloaded fixtures",
      ),
    )
    .addOption(
      new Option(
        "-l, --ledger <LEDGER_DIR>",
        "location for the local ledger",
      ).default(DEFAULT_TEST_LEDGER_DIR),
    )
    .addOption(
      new Option(
        "--output",
        "output the generated test validator command while executing it",
      ),
    )
    .addOption(COMMON_OPTIONS.outputOnly)
    .addOption(COMMON_OPTIONS.accountDir)
    .addOption(COMMON_OPTIONS.config)
    .addOption(COMMON_OPTIONS.keypair)
    .addOption(COMMON_OPTIONS.url)
    .action(async (options, { args: passThroughArgs }) => {
      if (!options.outputOnly) {
        titleMessage("solana-test-validator");
      } else options.output = options.outputOnly;

      await checkCommand("solana-test-validator --version", {
        exit: true,
        message:
          "Unable to detect the 'solana-test-validator'. Do you have it installed?",
      });

      let config = loadConfigToml(options.config, options);

      updateGitignore([DEFAULT_CACHE_DIR, DEFAULT_TEST_LEDGER_DIR]);

      let authorityAddress: string | null = null;
      if (config.settings.keypair) {
        if (doesFileExist(config.settings.keypair)) {
          authorityAddress = (
            await loadKeypairSignerFromFile(config.settings.keypair)
          ).address;
        } else {
          warnMessage(
            `Unable to locate keypair file: ${config.settings.keypair}`,
          );
          warnMessage("Skipping auto creation and setting authorities");
        }
      }

      // let localPrograms: SolanaTomlCloneLocalProgram = {};
      let locatedPrograms: ReturnType<
        typeof listLocalPrograms
      >["locatedPrograms"] = {};

      // attempt to load and combine the anchor toml clone settings
      const anchorToml = loadAnchorToml(config.configPath);
      if (anchorToml) {
        config = deconflictAnchorTomlWithConfig(anchorToml, config);

        // deep merge the solana and anchor config, taking priority with solana toml
        config.programs = deepMerge(config.programs, anchorToml.programs);
      }

      Object.assign(
        locatedPrograms,
        listLocalPrograms({
          configPath: config.configPath,
          labels: config.programs,
          cluster: "localnet", // todo: handle the user selecting the `cluster`
        }).locatedPrograms,
      );

      // todo: check if all the local programs were compiled/found, if not => prompt
      // if (!localListing.allFound) {
      //   // todo: add the ability to prompt the user to build their anchor programs
      //   warnMessage(`Have you built all your local programs?`);
      // }

      // auto run the clone on reset
      if (options.reset) {
        // run the clone command with default options
        // todo: could we pass options in here if we want?
        await cloneCommand().parseAsync([]);
      }

      // todo: this is flaky and does not seem to detect if some are missing. fix it
      const cloneCounts = validateExpectedCloneCounts(
        config.settings.accountDir,
        config.clone,
      );
      if (cloneCounts.actual !== cloneCounts.expected) {
        warnMessage(
          `Expected ${cloneCounts.expected} fixtures, but only ${cloneCounts.actual} found.`,
        );

        if (!options.outputOnly) {
          await promptToAutoClone();
        }
      }

      const command = buildTestValidatorCommand({
        verbose: !options.output,
        reset: options.reset || false,
        accountDir: config.settings.accountDir,
        ledgerDir: config.settings.ledgerDir,
        // todo: allow setting the authority from the cli args
        authority: authorityAddress,
        localPrograms: locatedPrograms,
      });

      if (options.output) console.log(`\n${command}\n`);
      // only log the "run validator" command, do not execute it
      if (options.outputOnly) process.exit();

      if (options.reset) {
        console.log(
          "Loaded",
          loadFileNamesToMap(config.settings.accountDir, ".json").size,
          "accounts into the local validator",
        );
        console.log(
          "Loaded",
          loadFileNamesToMap(config.settings.accountDir, ".so").size,
          "programs into the local validator",
        );
      }

      console.log("\nSolana Explorer for your local test validator:");
      console.log(
        "(on Brave Browser, you may need to turn Shields down for the Explorer website)",
      );
      console.log(getExplorerLink({ cluster: "localnet" }).toString());

      shellExecInSession({
        command,
        args: passThroughArgs,
        outputOnly: options.outputOnly,
      });
    });
}

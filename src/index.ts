#!/usr/bin/env node

import { assertRuntimeVersion } from "@/lib/node";
import { checkForSelfUpdate } from "@/lib/npm";
import { errorOutro } from "@/lib/logs";
import { cliProgramRoot } from "@/commands";

import { installCommand } from "@/commands/install";
// import { doctorCommand } from "@/commands/doctor";
import { infoCommand } from "@/commands/info";
import { cloneCommand } from "@/commands/clone";
import { validatorCommand } from "@/commands/validator";
import { buildCommand } from "@/commands/build";
import { coverageCommand } from "@/commands/coverage";
import { deployCommand } from "@/commands/deploy";
import { tokenCommand } from "./commands/token";
import { docsCommand } from "@/commands/docs";
import { inspectCommand } from "@/commands/inspect";

// ensure the user running the cli tool is on a supported javascript runtime version
assertRuntimeVersion();

async function main() {
  // create a global error boundary
  try {
    // auto check for new version of the cli
    await checkForSelfUpdate();

    try {
      const program = cliProgramRoot();

      program
        .addCommand(installCommand())
        // .addCommand(doctorCommand())
        .addCommand(validatorCommand())
        .addCommand(inspectCommand())
        .addCommand(cloneCommand())
        .addCommand(buildCommand())
        .addCommand(deployCommand())
        .addCommand(tokenCommand())
        .addCommand(coverageCommand())
        .addCommand(infoCommand())
        .addCommand(docsCommand());

      // set the default action to `help` without an error
      if (process.argv.length === 2) {
        process.argv.push("--help");
      }

      await program.parseAsync();
    } catch (err) {
      errorOutro(err.toString());
    }
  } catch (err) {
    errorOutro(err, "[mucho - unhandled error]");
  }

  // add a line spacer at the end to make the terminal easier to read
  console.log();
}

main();

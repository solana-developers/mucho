import { Command, Option } from "@commander-js/extra-typings";
import { cliOutputConfig, loadSolanaCliConfig } from "@/lib/cli";
import { COMMON_OPTIONS } from "@/const/commands";
import { errorMessage, titleMessage, warnMessage } from "@/lib/logs";
import ora from "ora";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  getProgramDerivedAddress,
  type Address,
  getAddressEncoder,
} from "@solana/web3.js";
import {
  getExplorerUrl,
  getRpcUrlFromMoniker,
  loadKeypairFromFile,
  parseRpcUrlOrMoniker,
  signAndSendTransaction,
} from "@/lib/solana";
import { getCreateAccountInstruction } from "@solana-program/system";
import { 
  getCreateMetadataAccountV3Instruction,
  TOKEN_METADATA_PROGRAM_ADDRESS,
} from "@/lib/codama/metadata/instructions/createMetadataAccountV3";

export function createTokenCommand() {
  return new Command("create")
    .configureOutput(cliOutputConfig)
    .description("create a new token")
    .usage("[options] [-- <CREATE_TOKEN_ARGS>...]")
    .addOption(
      new Option(
        "-n --name <NAME>",
        `argument to pass the name of the token you want to create`,
      ),
    )
    .addOption(
      new Option(
        "-s --symbol <SYMBOL>",
        `argument to pass the symbol of the token you want to create`,
      ),
    )
    .addOption(
      new Option(
        "-d --decimals <DECIMALS>",
        `argument to pass the decimals of the token you want to create`,
      ),
    )
    .addOption(new Option("-a --amount <AMOUNT>", `amount of tokens to create`))
    .addOption(
      new Option(
        "-m --metadata <METADATA_URI>",
        `URI to metadata for your token`,
      ),
    )
    .addOption(
      new Option(
        "-f --freeze-authority <FREEZE_AUTHORITY>",
        `freeze authority for your token`,
      ),
    )
    .addOption(
      new Option(
        "-c --custom-mint <CUSTOM_MINT_FILEPATH>",
        `Keypair file for a custom mint address. If not provided, a new keypair will be created.`,
      ),
    )
    .addOption(COMMON_OPTIONS.url)
    .addOption(COMMON_OPTIONS.manifestPath)
    .addOption(COMMON_OPTIONS.keypair)
    .addOption(COMMON_OPTIONS.config)
    .addOption(COMMON_OPTIONS.outputOnly)
    .action(async (options) => {
      titleMessage("Create a new token");

      const spinner = ora("Creating token").start();

      let cliConfig = loadSolanaCliConfig();

      if (!options.metadata) {
        errorMessage("\nNo metadata URI provided\nPlease provide a metadata URI with -m <METADATA_URI>");
        spinner.stop();
        return;
      }

      if (!options.name) {
        errorMessage("\nNo name provided\nPlease provide a name with -n <NAME>");
        spinner.stop();
        return;
      }

      if (!options.symbol) {
        errorMessage("\nNo symbol provided\nPlease provide a symbol with -s <SYMBOL>");
        spinner.stop();
        return;
      }

      if (!options.amount) {
        errorMessage("\nNo amount provided\nPlease provide an amount with -a <AMOUNT>");
        spinner.stop();
        return;
      }

      if (options.url) {
        cliConfig.json_rpc_url = options.url;
      } else {
        const rpcUrl = getRpcUrlFromMoniker(cliConfig.json_rpc_url);
        cliConfig.json_rpc_url = rpcUrl.toString();
      }

      if (!options.decimals) {
        warnMessage("\nNo decimals provided, setting default to 9\n");
        options.decimals = "9";
      }

      const websocketUrl = new URL(cliConfig.json_rpc_url);
      websocketUrl.protocol = "ws";
      cliConfig.websocket_url = websocketUrl.toString();

      const rpc = createSolanaRpc(parseRpcUrlOrMoniker(cliConfig.json_rpc_url));
      const rpcSubscriptions = createSolanaRpcSubscriptions(
        cliConfig.websocket_url,
      );
      const authority = await loadKeypairFromFile();
      const mint = await generateKeyPairSigner();

      const space = BigInt(getMintSize());
      const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
      const instructions = [
        getCreateAccountInstruction({
          payer: authority,
          newAccount: mint,
          lamports: rent,
          space,
          programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        getInitializeMintInstruction({
          mint: mint.address,
          decimals: Number(options.decimals),
          mintAuthority: authority.address,
          freezeAuthority: authority.address,
        }),
      ];

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const createMintTransaction = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(authority, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
      );

      const createMintSignature = await signAndSendTransaction(
        { rpc, rpcSubscriptions },
        createMintTransaction,
      );
      console.log(
        `\nMint Account Created: ${getExplorerUrl(
          cliConfig.json_rpc_url,
          createMintSignature,
        )}\n`,
      );

      // Create metadata account
      const [metadataPda] = await getProgramDerivedAddress({
        programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
        seeds: [
          Buffer.from('metadata'),
          getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ADDRESS),
          getAddressEncoder().encode(mint.address),
        ],
      });

      const metadataInstruction = getCreateMetadataAccountV3Instruction({
        metadata: metadataPda,
        mint: mint.address,
        mintAuthority: authority,
        payer: authority,
        updateAuthority: authority.address,
        data: {
          name: options.name,
          symbol: options.symbol,
          uri: options.metadata,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null
        },
        isMutable: true,
        collectionDetails: null
      });

      const createMetadataTransaction = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(authority, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions([metadataInstruction], tx),
      );

      const createMetadataSignature = await signAndSendTransaction(
        { rpc, rpcSubscriptions },
        createMetadataTransaction,
      );
      console.log(
        `\nMetadata Account Created: ${getExplorerUrl(
          cliConfig.json_rpc_url,
          createMetadataSignature,
        )}\n`,
      );

      const [ata, bump] = await findAssociatedTokenPda({
        owner: authority.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint: mint.address,
      });

      const createATA =
        await getCreateAssociatedTokenIdempotentInstructionAsync({
          mint: mint.address,
          payer: authority,
          owner: authority.address,
        });

      if (!options.amount) {
        warnMessage(
          "No amount provided, skipping minting tokens to your account",
        );
        warnMessage(
          "Please provide an amount to mint tokens to your account with -a <AMOUNT>",
        );
        spinner.stop();
        return;
      }

      const mintTo = getMintToInstruction({
        mint: mint.address,
        token: ata,
        amount: BigInt(Number(options.amount) * 10 ** Number(options.decimals)),
        mintAuthority: authority.address,
      });

      const createTokens = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(authority, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions([createATA, mintTo], tx),
      );

      const createTokensSignature = await signAndSendTransaction(
        { rpc, rpcSubscriptions },
        createTokens,
      );
      console.log(
        `\nTokens minted to your account: ${getExplorerUrl(
          cliConfig.json_rpc_url,
          createTokensSignature,
        )}\n`,
      );

      spinner.stop();
    });
}

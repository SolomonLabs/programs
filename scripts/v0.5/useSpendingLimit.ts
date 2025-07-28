import { PublicKey, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as anchor from "@coral-xyz/anchor";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { USDC } from "../consts.js";

const provider = anchor.AnchorProvider.env();
const payer = provider.wallet["payer"];

const SQUADS_MULTISIG_ADDRESS = new PublicKey("89YiRojGYDkW17AM7eNNsvouZoYjNTE22Detd3VzHtF6"); // NOTE: This is the multisig address; NOT THE VAULT ADDRESS
const SPENDING_ADDRESS = new PublicKey("5jRqFejxKHWMfR69dbYF2A9TnpnBPjz7iaRQS44imcMi"); // NOTE: This is your wallet address
const SPENDING_LIMIT_ACCOUNT = new PublicKey("5gn6mBnPqp4AQUXyanadwcse8eVqUNFxnc2zrKJV8kCn") // NOTE: This is the spending limit account; NOT THE VAULT ADDRESS
const SPENDING_AMOUNT = 10_000; // in USDC

async function main() {
  // Get the associated token address for the spending token
  const spendingTokenAccount = getAssociatedTokenAddressSync(
    USDC,
    payer.publicKey,
    true
  );

  // Get the decimals for the token for use when spending
  const tokenAccountInfo = await provider.connection.getParsedAccountInfo(USDC);
  if (!tokenAccountInfo.value.data || typeof tokenAccountInfo.value.data === 'string' || 'parsed' in tokenAccountInfo.value.data === false) {
    throw new Error("Token account data is not parsed");
  }
  
  const spendingTokenDecimals = tokenAccountInfo.value.data.parsed.info.decimals;

  // With decimals, convert the amount from human to chain
  const amountConverted = SPENDING_AMOUNT * (10 ** spendingTokenDecimals);

  const ixs = [];
  try {
    // See if there is a token account and if it has a balance, if not, create it
    const tokenAccountInfo = await provider.connection.getAccountInfo(spendingTokenAccount);
    if (!tokenAccountInfo) {
      throw new Error("Token account not found");
    }

  } catch (error) {
    // Create the spending USDC account if it doesn't exist
    console.log("Token account not found, creating it");
    const createIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      spendingTokenAccount,
      SPENDING_ADDRESS,
      USDC
    )
    ixs.push(createIx);
  }

  // Use the spending limit
  const ix = multisig.instructions.spendingLimitUse({
    multisigPda: SQUADS_MULTISIG_ADDRESS,
    member: SPENDING_ADDRESS,
    spendingLimit: SPENDING_LIMIT_ACCOUNT,
    mint: USDC,
    vaultIndex: 0, // NOTE: If you have multiple vaults, you can use the vaultIndex to specify which vault to use
    amount: amountConverted,
    decimals: spendingTokenDecimals,
    destination: SPENDING_ADDRESS, // NOTE: This does not need to be the ATA, but the account needs to exist.
  });

  ixs.push(ix);

  const tx = new Transaction().add(...ixs);
  const blockhash = await provider.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash.blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer);
  const txHash = await provider.connection.sendRawTransaction(tx.serialize());
  await provider.connection.confirmTransaction(txHash, "confirmed");
  console.log(txHash);
}

main();
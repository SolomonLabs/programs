import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as anchor from "@coral-xyz/anchor";
import { PERMISSIONLESS_ACCOUNT } from "@metadaoproject/futarchy/v0.5";

const provider = anchor.AnchorProvider.env();
const payer = provider.wallet["payer"];

const SQUADS_MULTISIG_ADDRESS = new PublicKey("7AivcS5Sm3uneG7EKtjAmmgWeQ653v6B1Uzc3JiYWihY");
const SQUADS_PROPOSAL_PDA = new PublicKey("HDyg2gbibGfDf672KN9MU38Z5dnNVaSiTsVQw33WnY5Q"); // NOTE: This is NOT the transaction PDA (eg the URL in squads)
const DAO_KEY = new PublicKey("9NCPLEFgiu4XZdp9wtWMc1mXyY26VGeWsoKHCAPP3bAo");

async function main() {

  const createKey = DAO_KEY;

  const [multisigPda] = multisig.getMultisigPda({
    createKey,
  });

  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigPda
  );
  console.log("permissioneless pubkey", PERMISSIONLESS_ACCOUNT.publicKey.toBase58());

  console.log("multisigInfo", multisigInfo);

  const transactionIndex = Number(multisigInfo.transactionIndex);
  console.log("transactionIndex", transactionIndex);

  // const multisigAccountInfo = await multisig.accounts.Multisig.fromAccountAddress(
  //   provider.connection,
  //   SQUADS_MULTISIG_ADDRESS
  // );

  const squadsProposal = await multisig.accounts.Proposal.fromAccountAddress(
    provider.connection,
    SQUADS_PROPOSAL_PDA
  );

  const proposalIndex = Number(squadsProposal.transactionIndex);
  // console.log("proposalIndex", proposalIndex);

  const squadsExecuteIx = await multisig.instructions.vaultTransactionExecute({
    connection: provider.connection,
    multisigPda: multisigPda,
    transactionIndex: BigInt(proposalIndex.toString()),
    member: PERMISSIONLESS_ACCOUNT.publicKey,
  });

  const vaultTxExecuteIxResolved = await squadsExecuteIx


  const tx = new Transaction().add(vaultTxExecuteIxResolved.instruction);
  const recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = payer.publicKey;
  try{
    
    // Sign with both accounts
    tx.sign(payer, PERMISSIONLESS_ACCOUNT);
  
    
    const txHash = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction(txHash, "confirmed");


  // const transactionMessage = new TransactionMessage({
  //   payerKey: payer.publicKey,
  //   recentBlockhash: recentBlockhash,
  //   instructions: [squadsExecuteIx.instruction],
  // });
  // try { 

  // const txn = new VersionedTransaction(transactionMessage.compileToV0Message(squadsExecuteIx.lookupTableAccounts));
  // txn.sign([payer, PERMISSIONLESS_ACCOUNT]);
  // txn.
  
    
  // const tstTxn = await provider.connection.sendRawTransaction(txn.serialize());
  // const txHash = await provider.connection.sendRawTransaction(txn.serialize());
  // await provider.connection.confirmTransaction(txHash, "confirmed");

  // console.log("tstTxn", tstTxn);
  // const txHash = await provider.connection.sendRawTransaction(txn.serialize());
  // await provider.connection.confirmTransaction(txHash, "confirmed");
    console.log("Transaction hash:", txHash);
  } catch (error) {
    console.log("error", error);
  }

}

main();
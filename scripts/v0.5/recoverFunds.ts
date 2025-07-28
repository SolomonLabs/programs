import { AmmClient, AUTOCRAT_PROGRAM_ID, AutocratClient, ConditionalVaultClient, getProposalAddr } from "@metadaoproject/futarchy/v0.5";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const provider = anchor.AnchorProvider.env();
const payer = provider.wallet["payer"];

const autocratClient = AutocratClient.createClient({ provider });
const vaultClient = ConditionalVaultClient.createClient({ provider });
const ammClient = AmmClient.createClient({ provider });

const DAO_KEY = new PublicKey("9NCPLEFgiu4XZdp9wtWMc1mXyY26VGeWsoKHCAPP3bAo");
const SQUADS_PROPOSAL_PDA = new PublicKey("HDyg2gbibGfDf672KN9MU38Z5dnNVaSiTsVQw33WnY5Q");

async function main() {

  const dao = await autocratClient.getDao(DAO_KEY);

  const [metaDaoProposal] = getProposalAddr(AUTOCRAT_PROGRAM_ID, SQUADS_PROPOSAL_PDA);

  const proposal = await autocratClient.getProposal(metaDaoProposal);
  console.log("proposal", proposal);

  const {
    baseVault, quoteVault, passAmm,
    failAmm, passBaseMint, passQuoteMint,
    failBaseMint, failQuoteMint, question,
    passLp, failLp
  } = autocratClient.getProposalPdas(metaDaoProposal, dao.baseMint, dao.quoteMint, DAO_KEY);

  try {
    const passLpAmount = await provider.connection.getTokenAccountBalance(
      getAssociatedTokenAddressSync(passLp, payer.publicKey, true)
    );
    const failLpAmount = await provider.connection.getTokenAccountBalance(
      getAssociatedTokenAddressSync(failLp, payer.publicKey, true)
    );

    // TODO: Get balance of LP so we can withdraw it
    const withdrawLP = await ammClient.removeLiquidityIx(passAmm, passBaseMint, passQuoteMint, new BN(passLpAmount.value.amount.toString()), new BN(0), new BN(0)).rpc();
    const withdrawLpQuote = await ammClient.removeLiquidityIx(failAmm, failBaseMint, failQuoteMint, new BN(failLpAmount.value.amount.toString()), new BN(0), new BN(0)).rpc();

    console.log("withdrawLP", withdrawLP);
    console.log("withdrawLpQuote", withdrawLpQuote);
  } catch (error) {
    console.log(error);
  }

  const baseVaultUserTokenAccount = getAssociatedTokenAddressSync(passBaseMint, payer.publicKey);
  const quoteVaultUserTokenAccount = getAssociatedTokenAddressSync(passQuoteMint, payer.publicKey);

  const baseTokens = await provider.connection.getTokenAccountBalance(baseVaultUserTokenAccount);
  const quoteTokens = await provider.connection.getTokenAccountBalance(quoteVaultUserTokenAccount);

  const baseTokenAmountBN = new BN(baseTokens.value.amount.toString());
  const quoteTokenAmountBN = new BN(Number(quoteTokens.value.amount.toString()));

  console.log("baseTokensToMerge", baseTokens.value.amount.toString());
  console.log("quoteTokensToMerge", quoteTokens.value.amount.toString());


  if (proposal && (proposal.state.passed || proposal.state.failed)) {
    console.log("Proposal passed or failed using redeem vs merge");
    const withdraw = await vaultClient.redeemTokensIx(question, baseVault, dao.baseMint, 2, payer.publicKey).rpc();
    const withdrawQuote = await vaultClient.redeemTokensIx(question, quoteVault, dao.quoteMint, 2, payer.publicKey).rpc();

    console.log("withdraw", withdraw);
    console.log("withdrawQuote", withdrawQuote);
  } else {

    const mergeTokens = await vaultClient.mergeTokensIx(question, baseVault, dao.baseMint, baseTokenAmountBN, 2, payer.publicKey).rpc();
    const mergeTokensQuote = await vaultClient.mergeTokensIx(question, quoteVault, dao.quoteMint, quoteTokenAmountBN, 2, payer.publicKey).rpc();

    console.log("mergeTokens", mergeTokens);
    console.log("mergeTokensQuote", mergeTokensQuote);
  }
  
}

main();
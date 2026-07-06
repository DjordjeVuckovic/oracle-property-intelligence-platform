import { fromNodeProviderChain, fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { loadEnv } from "./env.js";

// AWS credential + region resolution for Bedrock, with an env-gated cross-account
// mode. Both the answer (Claude) and embedding (Titan) call sites go through here
// so single-account vs. cross-account is one switch, not three.
//
//   - Single-account (default): BEDROCK_ASSUME_ROLE_ARN unset → resolve the
//     ambient credential chain (App Runner instance role in prod; AWS_PROFILE /
//     SSO in dev) and call Bedrock in AWS_REGION.
//   - Cross-account: BEDROCK_ASSUME_ROLE_ARN set → the ambient identity assumes
//     that role and calls Bedrock in BEDROCK_REGION (billed to the role's
//     account). Use this to run the app in an account with no on-demand Bedrock
//     quota while invoking a Bedrock-enabled account. Unset the var to switch back.

export function bedrockRegion(): string {
  const env = loadEnv();
  return env.BEDROCK_REGION ?? env.AWS_REGION;
}

export function bedrockCredentialProvider(): ReturnType<typeof fromNodeProviderChain> {
  const env = loadEnv();
  if (env.BEDROCK_ASSUME_ROLE_ARN === undefined) return fromNodeProviderChain();
  return fromTemporaryCredentials({
    masterCredentials: fromNodeProviderChain(),
    params: {
      RoleArn: env.BEDROCK_ASSUME_ROLE_ARN,
      RoleSessionName: "oracle-bedrock",
      ...(env.BEDROCK_ASSUME_ROLE_EXTERNAL_ID === undefined
        ? {}
        : { ExternalId: env.BEDROCK_ASSUME_ROLE_EXTERNAL_ID }),
    },
    // STS runs in the Bedrock region so the assumed session targets the right
    // regional endpoints.
    clientConfig: { region: bedrockRegion() },
  });
}

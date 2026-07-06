#!/usr/bin/env bash
# Create the cross-account Bedrock role in the Bedrock-ENABLED account so the
# app's App Runner instance role (in the app account) can assume it and invoke
# Bedrock there. Run once, against the Bedrock-enabled account.
#
# The elep side (granting the instance role sts:AssumeRole) is handled by CDK
# automatically when you deploy with BEDROCK_ASSUME_ROLE_ARN set — see the tail.
#
# Usage:
#   ME_PROFILE=me APP_ACCOUNT_ID=410432886145 [EXTERNAL_ID=<secret>] \
#     ./scripts/setup-cross-account-bedrock.sh
set -euo pipefail

ME_PROFILE="${ME_PROFILE:-me}"                 # profile for the Bedrock-enabled account
APP_ACCOUNT_ID="${APP_ACCOUNT_ID:-410432886145}"  # account App Runner runs in (elep)
ROLE_NAME="${ROLE_NAME:-oracle-bedrock-invoke}"
EXTERNAL_ID="${EXTERNAL_ID:-}"                  # optional confused-deputy guard
BEDROCK_REGION="${BEDROCK_REGION:-us-east-1}"

ME_ACCOUNT_ID="$(aws --profile "$ME_PROFILE" sts get-caller-identity --query Account --output text)"
echo "==> Bedrock-enabled account: $ME_ACCOUNT_ID   |   app account: $APP_ACCOUNT_ID"

# Trust the app account; require ExternalId when provided (recommended).
if [ -n "$EXTERNAL_ID" ]; then
  COND=",\"Condition\":{\"StringEquals\":{\"sts:ExternalId\":\"$EXTERNAL_ID\"}}"
else
  COND=""
fi
TRUST="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"arn:aws:iam::${APP_ACCOUNT_ID}:root\"},\"Action\":\"sts:AssumeRole\"${COND}}]}"

if aws --profile "$ME_PROFILE" iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws --profile "$ME_PROFILE" iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST"
  echo "==> updated trust policy on existing role $ROLE_NAME"
else
  aws --profile "$ME_PROFILE" iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST" \
    --description "Cross-account Bedrock InvokeModel for the Oracle app" >/dev/null
  echo "==> created role $ROLE_NAME"
fi

aws --profile "$ME_PROFILE" iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name bedrock-invoke \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":"*"}]}'

ROLE_ARN="arn:aws:iam::${ME_ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "==> role ready: $ROLE_ARN"
echo "==> deploy the app pointing Bedrock at it (elep-side assume grant is added by CDK):"
echo "      BEDROCK_ASSUME_ROLE_ARN=$ROLE_ARN \\"
[ -n "$EXTERNAL_ID" ] && echo "      BEDROCK_ASSUME_ROLE_EXTERNAL_ID=$EXTERNAL_ID \\"
echo "      BEDROCK_REGION=$BEDROCK_REGION \\"
echo "      pnpm --filter @oracle/infra deploy"
echo ""
echo "==> switch back to single-account later: redeploy with the BEDROCK_* vars unset."

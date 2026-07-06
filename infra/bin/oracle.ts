import { App, Tags } from "aws-cdk-lib";

import { DataStack } from "../lib/data-stack.js";
import { WebStack } from "../lib/web-stack.js";

// Every tunable is env-driven with a documented default (no hardcoded infra
// values). Account/region come from the active AWS profile via CDK_DEFAULT_*.
const app = new App();

const projectName = process.env.PROJECT_NAME ?? "oracle-property-intelligence";
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-2",
};

const dataStack = new DataStack(app, "OracleDataStack", {
  env,
  allowCidr: process.env.INGEST_ALLOW_CIDR ?? "0.0.0.0/0",
  instanceType: process.env.DB_INSTANCE_TYPE ?? "t4g.small",
  allocatedStorageGb: Number(process.env.DB_ALLOCATED_STORAGE_GB ?? 50),
});

new WebStack(app, "OracleWebStack", {
  env,
  projectName,
  dbEndpointAddress: dataStack.dbEndpointAddress,
  dbEndpointPort: dataStack.dbEndpointPort,
  dbSecret: dataStack.dbSecret,
  cpu: process.env.WEB_CPU ?? "1 vCPU",
  memory: process.env.WEB_MEMORY ?? "2 GB",
});

// Tag everything for cost attribution and ownership.
Tags.of(app).add("project_name", projectName);

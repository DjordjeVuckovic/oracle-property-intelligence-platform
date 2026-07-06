import { CfnOutput, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Construct } from "constructs";

export type WebStackProps = StackProps & {
  readonly projectName: string;
  readonly dbEndpointAddress: string;
  readonly dbEndpointPort: string;
  readonly dbSecret: secretsmanager.ISecret;
  readonly cpu: string;
  readonly memory: string;
};

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const webImage = new ecrAssets.DockerImageAsset(this, "WebImage", {
      directory: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
      file: "apps/web/Dockerfile",
      platform: ecrAssets.Platform.LINUX_AMD64,
      exclude: [".env", ".env.*", ".data", ".git", "**/.next", "**/node_modules"],
    });

    const accessRole = new iam.Role(this, "AppRunnerEcrAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    accessRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      })
    );
    webImage.repository.grantPull(accessRole);

    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      })
    );

    const dbPassword = new secretsmanager.Secret(this, "WebDbPassword", {
      secretName: `${props.projectName}/web-db-password`,
      secretStringValue: SecretValue.unsafePlainText(
        props.dbSecret.secretValueFromJson("password").unsafeUnwrap()
      ),
    });
    dbPassword.grantRead(instanceRole);

    const service = new apprunner.CfnService(this, "WebService", {
      serviceName: `${props.projectName}-web`,
      instanceConfiguration: {
        cpu: props.cpu,
        memory: props.memory,
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        path: "/",
        protocol: "HTTP",
      },
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: webImage.imageUri,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3000",
            runtimeEnvironmentSecrets: [
              {
                name: "DATABASE_PASSWORD",
                value: dbPassword.secretArn,
              },
            ],
            runtimeEnvironmentVariables: [
              { name: "NODE_ENV", value: "production" },
              { name: "NEXT_TELEMETRY_DISABLED", value: "1" },
              { name: "DATABASE_HOST", value: props.dbEndpointAddress },
              { name: "DATABASE_PORT", value: props.dbEndpointPort },
              { name: "DATABASE_NAME", value: "oracle" },
              { name: "DATABASE_USER", value: "oracle" },
              { name: "DATABASE_SSL", value: "require" },
              { name: "AWS_REGION", value: Stack.of(this).region },
              {
                name: "EMBED_MODEL_ID",
                value: process.env.EMBED_MODEL_ID ?? "amazon.titan-embed-text-v2:0",
              },
              { name: "EMBED_DIMS", value: process.env.EMBED_DIMS ?? "512" },
              {
                name: "ANSWER_MODEL_ID",
                value: process.env.ANSWER_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
              },
              { name: "LOG_LEVEL", value: process.env.LOG_LEVEL ?? "info" },
            ],
          },
        },
      },
    });
    service.node.addDependency(accessRole);
    service.node.addDependency(instanceRole);
    service.node.addDependency(dbPassword);

    new CfnOutput(this, "WebUrl", { value: `https://${service.attrServiceUrl}` });
  }
}

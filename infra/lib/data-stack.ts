import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";

export type DataStackProps = StackProps & {
  /** CIDR permitted to reach Postgres on 5432. Public read-only data; default
   * open so the hosted API (Lambda outside the VPC) and ingest can connect.
   * Tighten to an office/CI CIDR by setting INGEST_ALLOW_CIDR. */
  readonly allowCidr: string;
  readonly instanceType: string;
  readonly allocatedStorageGb: number;
};

// Data stack: RDS Postgres 16 (pgvector-capable) in the account's default VPC,
// publicly reachable with generated credentials in Secrets Manager. No VPC/NAT
// is created — cost-driven and sufficient because the payload is public property
// data. The API Lambda connects over TLS using the secret.
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      description: "Oracle property DB access",
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowCidr),
      ec2.Port.tcp(5432),
      "Postgres access for ingest + hosted API"
    );

    const credentials = rds.Credentials.fromGeneratedSecret("oracle", {
      secretName: "oracle/property-db",
    });

    const instance = new rds.DatabaseInstance(this, "PropertyDb", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.of("18.2", "18"),
      }),
      instanceType: new ec2.InstanceType(props.instanceType),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: true,
      securityGroups: [dbSecurityGroup],
      credentials,
      databaseName: "oracle",
      allocatedStorage: props.allocatedStorageGb,
      maxAllocatedStorage: props.allocatedStorageGb * 2,
      storageType: rds.StorageType.GP3,
      multiAz: false,
      backupRetention: Duration.days(1),
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "DbEndpoint", { value: instance.dbInstanceEndpointAddress });
    new CfnOutput(this, "DbPort", { value: instance.dbInstanceEndpointPort });
    new CfnOutput(this, "DbSecretArn", { value: instance.secret?.secretArn ?? "none" });
    new CfnOutput(this, "DbSecretName", { value: "oracle/property-db" });
  }
}

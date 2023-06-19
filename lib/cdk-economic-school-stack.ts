// import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';
// import * as ecs from 'aws-cdk-lib/aws-ecs';
// import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
// import * as rds from 'aws-cdk-lib/aws-rds';
// import * as ecr from 'aws-cdk-lib/aws-ecr';
// import { Construct } from 'constructs';
// import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
// import { Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';

// export class CdkEconomicSchoolStack extends Stack {
//   constructor(scope: Construct, id: string, props?: StackProps) {
//     super(scope, id, props);

//     // VPC関連のリソース作成
//     const vpc: ec2.Vpc = new ec2.Vpc(this, 'EcoEcsVpc', {
//       cidr: '10.6.0.0/16',
//       subnetConfiguration: [
//         // Optional（省略すると、PUBLICとPRIVATE_WITH_NATのみ生成される）
//         {
//           cidrMask: 24,
//           name: 'ingress',
//           subnetType: ec2.SubnetType.PUBLIC,
//         },
//         {
//           cidrMask: 24,
//           name: 'application',
//           subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
//         },
//         {
//           cidrMask: 28,
//           name: 'rds',
//           subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
//         },
//       ],
//     });

//     // Security Group
//     const ecsSG = new SecurityGroup(this, 'EcoEcsSecurityGroup', {
//       vpc,
//     });

//     const rdsSG = new SecurityGroup(this, 'EcoRdsSecurityGroup', {
//       vpc,
//       allowAllOutbound: true,
//     });
//     // point!!
//     rdsSG.connections.allowFrom(ecsSG, Port.tcp(5432), 'Ingress 5432 from ECS');

//     const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
//       engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_2 }),
//       parameters: {
//         "rds.force_ssl": "1",
//       }
//     });
    
//     const rdsCluster = new rds.DatabaseCluster(this, 'EcoRds', {
//       engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_2 }),
//       vpcSubnets: {
//         subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
//       },
//       securityGroups: [rdsSG],
//       defaultDatabaseName: 'Eco',
//       parameterGroup: parameterGroup,
//       instances: 2, // You can adjust the number of instances
//       instanceProps: {
//         instanceType: new ec2.InstanceType('t3.medium'), // This is an example instance type
//         vpc: vpc // Specify VPC here
//       }
//     });

//     // RDS定義の後に追加
//     // SecretsManager(RDSにより自動設定)
//     const secretsmanager = rdsCluster.secret!;

//     const ecrRepository = ecr.Repository.fromRepositoryName(this, 'ExistingRepository', 'economic-school');

//     // ECS Cluster
//     const cluster = new ecs.Cluster(this, 'EcoCluster', {
//       vpc: vpc,
//     });

//     // Enable Fargate Capacity Providers on the cluster
//     // cluster.enableFargateCapacityProviders();


//     // ALB, FargateService, TaskDefinition
//     const loadBalancedFargateService =
//       new ecsPatterns.ApplicationLoadBalancedFargateService(
//         this,
//         'EcoService',
//         {
//           cluster: cluster, // Required
//           memoryLimitMiB: 1024,
//           cpu: 512,
//           desiredCount: 1, // Optional(省略値は3)
//           listenerPort: 80,
//           taskImageOptions: {
//             image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
//             containerPort: 8080,
//             // Secretの設定
//             secrets: {
//               dbname: ecs.Secret.fromSecretsManager(secretsmanager, 'dbname'),
//               username: ecs.Secret.fromSecretsManager(
//                 secretsmanager,
//                 'username'
//               ),
//               host: ecs.Secret.fromSecretsManager(secretsmanager, 'host'),
//               password: ecs.Secret.fromSecretsManager(
//                 secretsmanager,
//                 'password'
//               ),
//             },
            
//           },
//           securityGroups: [ecsSG],
//           healthCheckGracePeriod: Duration.seconds(240),
//           // capacityProviderStrategies: [
//           //   {
//           //     capacityProvider: 'FARGATE_SPOT',
//           //     weight: 1
//           //   }
//           // ] 
//         }
//       );

//     // HealthCheckの設定
//     loadBalancedFargateService.targetGroup.configureHealthCheck({
//       // path: '/custom-health-path',
//       path: '/',
//       healthyThresholdCount: 2, // Optional
//       interval: Duration.seconds(15), // Optional
//     });

//     // 最後に追加
//     // Add SecretsManager IAM policy to FargateTaskExecutionRole
//     const escExecutionRole = Role.fromRoleArn(
//       this,
//       'ecsExecutionRole',
//       loadBalancedFargateService.taskDefinition.executionRole!.roleArn,
//       {}
//     );
//     escExecutionRole.attachInlinePolicy(
//       new Policy(this, 'EcoSMGetPolicy', {
//         statements: [
//           new PolicyStatement({
//             actions: ['secretsmanager:GetSecretValue'],
//             resources: [secretsmanager.secretArn],
//           }),
//         ],
//       })
//     );
//   }
// }
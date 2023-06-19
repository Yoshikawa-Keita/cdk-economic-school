import {
    aws_certificatemanager as acm,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecr as ecr,
    aws_rds as rds,
    aws_sqs as sqs,
    aws_iam as iam,
    aws_secretsmanager as sm,
    aws_lambda as lambda,
    aws_elasticloadbalancingv2 as elbv2,
    aws_logs as log,
    aws_route53 as route53,
    aws_route53_targets as route53Targets,
    aws_lambda_event_sources,
    Stack,
    StackProps,
    Duration,

  } from 'aws-cdk-lib';
  import { Construct } from 'constructs';

const domainName = `economic-school.com`;

export class EcoEcsFargate extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
      super(scope, id, props);

      // SQS QUEUEを作成
      const queue = new sqs.Queue(this, 'email-sending-queue', {
        visibilityTimeout: Duration.seconds(300),  // Maximum time that the Lambda function needs to process a message
        queueName: "email-sending-queue",
    });
      
    const secret = sm.Secret.fromSecretNameV2(this, 'Secret', 'secretsForEnv');
    const lambdaFn = new lambda.Function(this, 'SendVerificationEmailFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'sendVerificationEmail.sendVerificationEmailHandler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: Duration.seconds(10),
      retryAttempts: 3,
      environment: {
        EMAIL_SUBJECT: "Welcome to Economi School",
      }
    });
    
     secret.grantRead(lambdaFn);
    
      
      lambdaFn.addEventSource(new aws_lambda_event_sources.SqsEventSource(queue));
      
      const policyStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*']
      });

      lambdaFn.addToRolePolicy(policyStatement);


      // ECS on FARGATE関連のリソース

      const vpc = new ec2.Vpc(this, 'VPC', {
        cidr: '10.1.0.0/16',
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'ingress',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'application',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            cidrMask: 28,
            name: 'rds',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
      // SecurityGroup
      const securityGroupELB = new ec2.SecurityGroup(this, 'SecurityGroupELB', {
        vpc,
      });
      securityGroupELB.addIngressRule(
        ec2.Peer.ipv4('0.0.0.0/0'),
        ec2.Port.tcp(443),
      );
  
      const securityGroupApp = new ec2.SecurityGroup(this, 'SecurityGroupApp', {
        vpc,
      });
  
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domainName,
      });
  
      const cert = new acm.Certificate(this, 'Certificate', {
        domainName: domainName,
        subjectAlternativeNames: [`ecs.${domainName}`],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
  
      // ALB
      const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
        vpc,
        securityGroup: securityGroupELB,
        internetFacing: true,
      });
      const listenerHTTP = alb.addListener('ListenerHTTP', {
        port: 443,
        certificates: [
          {
            certificateArn: cert.certificateArn,
          },
        ],
      });
      // Target Group
      const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
        vpc: vpc,
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: '/health',
          healthyHttpCodes: '200',
          interval: Duration.minutes(5),  // every 5 minutes
        },
      });
  
      listenerHTTP.addTargetGroups('DefaultHTTPSResponse', {
        targetGroups: [targetGroup],
      });

      const securityGroupRDS = new ec2.SecurityGroup(this, 'EcoRdsSecurityGroup', {
        vpc,
        allowAllOutbound: true,
      });
      
      securityGroupRDS.connections.allowFrom(securityGroupApp, ec2.Port.tcp(5432), 'Ingress 5432 from ECS');
  
      const rdsCluster = new rds.DatabaseCluster(this, 'EcoRds', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_2 }),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [securityGroupRDS],
        defaultDatabaseName: 'Eco',
        instances: 1, // とりあえず1で設定
        instanceProps: {
          instanceType: new ec2.InstanceType('t3.medium'), // TODO: 最適なスペック検討
          vpc: vpc 
        }
      });

    // RDS定義の後に追加
    // SecretsManager(RDSにより自動設定)
    const secretsmanager = rdsCluster.secret!;
  
      // ECS Cluster
      const cluster = new ecs.Cluster(this, 'Cluster', {
        vpc,
      });
      cluster.enableFargateCapacityProviders()
      const ecrRepository = ecr.Repository.fromRepositoryName(this, 'ExistingRepository', 'economic-school');
  
      // Fargate
      const fargateTaskDefinition = new ecs.FargateTaskDefinition(
        this,
        'TaskDef',
        {
          memoryLimitMiB: 512,
          cpu: 256,
        },
      );
      const container = fargateTaskDefinition.addContainer('AppContainer', {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: 'go-app',
          logRetention: log.RetentionDays.ONE_MONTH,
        }),
        secrets: {
            dbname: ecs.Secret.fromSecretsManager(secretsmanager, 'dbname'),
              username: ecs.Secret.fromSecretsManager(
                secretsmanager,
                'username'
              ),
              host: ecs.Secret.fromSecretsManager(secretsmanager, 'host'),
              password: ecs.Secret.fromSecretsManager(
                secretsmanager,
                'password'
              ),
        }
      });
      container.addPortMappings({
        containerPort: 3000,
        hostPort: 3000,
      });
      const service = new ecs.FargateService(this, 'Service', {
        cluster,
        taskDefinition: fargateTaskDefinition,
        desiredCount: 1,
        assignPublicIp: true,
        securityGroups: [securityGroupApp],
        capacityProviderStrategies: [{
            capacityProvider: 'FARGATE_SPOT',
            base: 1,
            weight: 1,
          }],
      });
      service.attachToApplicationTargetGroup(targetGroup);
  
      new route53.ARecord(this, `AliasRecord`, {
        zone: hostedZone,
        recordName: `ecs.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(alb),
        ),
      });


    }
}
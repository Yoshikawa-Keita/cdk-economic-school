import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_rds as rds,
  aws_sqs as sqs,
  aws_sns as sns,
  aws_sns_subscriptions as subs,
  aws_events as events,
  aws_events_targets as targets,
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
} from "aws-cdk-lib";
import { Construct } from "constructs";

const domainName = `economic-school.com`;

export class EcoEcsFargate extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // SQS QUEUEを作成
    const queue = new sqs.Queue(this, "email-sending-queue", {
      visibilityTimeout: Duration.seconds(300), // Maximum time that the Lambda function needs to process a message
      queueName: "email-sending-queue",
    });

    const secret = sm.Secret.fromSecretNameV2(this, "Secret", "secretsForEnv");

    // 新規登録メール認証lambda
    const lambdaFnForRegister = new lambda.Function(
      this,
      "SendVerificationEmailFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "sendVerificationEmail.sendVerificationEmailHandler",
        code: lambda.Code.fromAsset("lambda"),
        timeout: Duration.seconds(10),
        retryAttempts: 2,
        environment: {
          EMAIL_SUBJECT: "Welcome to Economi School",
        },
      }
    );

    secret.grantRead(lambdaFnForRegister);

    const policyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    lambdaFnForRegister.addToRolePolicy(policyStatement);

    // パスワード再設定lambda
    const lambdaFnForPassReset = new lambda.Function(
      this,
      "SendPasswordResetEmailFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "sendPasswordResetEmail.sendPasswordResetEmailHandler",
        code: lambda.Code.fromAsset("lambda"),
        timeout: Duration.seconds(10),
        retryAttempts: 2,
        environment: {
          EMAIL_SUBJECT: "Please reset your password",
        },
      }
    );

    secret.grantRead(lambdaFnForPassReset);

    const policyStatementForpassReset = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    lambdaFnForPassReset.addToRolePolicy(policyStatementForpassReset);

    // メールアドレス変更認証用lambda
    const lambdaFnForChangeEmail = new lambda.Function(
      this,
      "SendChangeEmailFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "sendChangeEmail.sendChangeEmailHandler",
        code: lambda.Code.fromAsset("lambda"),
        timeout: Duration.seconds(10),
        retryAttempts: 2,
        environment: {
          EMAIL_SUBJECT: "Please verify your new email",
        },
      }
    );

    // Secrets Managerからの読み取り権限を付与します。
    secret.grantRead(lambdaFnForChangeEmail);

    // SESへのEmail送信権限を付与します。
    const policyStatementForChangeEmail = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    lambdaFnForChangeEmail.addToRolePolicy(policyStatementForChangeEmail);

    // delete user email
    // メールアドレス変更認証用lambda
    const lambdaFnFordeleteUserEmail = new lambda.Function(
      this,
      "SendDeleteUserEmailFunction",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "sendDeleteUserEmail.sendDeleteUserEmailHandler",
        code: lambda.Code.fromAsset("lambda"),
        timeout: Duration.seconds(10),
        retryAttempts: 2,
        environment: {
          EMAIL_SUBJECT: "Account deleted",
        },
      }
    );

    // Secrets Managerからの読み取り権限を付与します。
    secret.grantRead(lambdaFnFordeleteUserEmail);

    // SESへのEmail送信権限を付与します。
    const policyStatementForDeleteUserEmail = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    lambdaFnFordeleteUserEmail.addToRolePolicy(
      policyStatementForDeleteUserEmail
    );

    // Email Facade lambda
    const lambdaFnForEmailFacade = new lambda.Function(this, "EmailFacade", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "emailFacade.emailFacadeHandler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      retryAttempts: 2,
      environment: {
        REGISTER_FUNCTION_ARN: lambdaFnForRegister.functionArn,
        PASSWORD_RESET_FUNCTION_ARN: lambdaFnForPassReset.functionArn,
        CHANGE_EMAIL_FUNCTION_ARN: lambdaFnForChangeEmail.functionArn,
        DELETE_USER_FUNCTION_ARN: lambdaFnFordeleteUserEmail.functionArn,
      },
    });

    // SQSイベントソースを追加します。
    lambdaFnForEmailFacade.addEventSource(
      new aws_lambda_event_sources.SqsEventSource(queue)
    );

    const policyStatementForCentralProcessor = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["lambda:InvokeFunction"],
      resources: ["*"],
    });

    lambdaFnForEmailFacade.addToRolePolicy(policyStatementForCentralProcessor);

    // ECS on FARGATE関連のリソース

    const vpc = new ec2.Vpc(this, "VPC", {
      cidr: "10.1.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "ingress",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "application",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: "rds",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    // SecurityGroup
    const securityGroupELB = new ec2.SecurityGroup(this, "SecurityGroupELB", {
      vpc,
    });
    securityGroupELB.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(443)
    );

    const securityGroupApp = new ec2.SecurityGroup(this, "SecurityGroupApp", {
      vpc,
    });
    const securityGroupbatch = new ec2.SecurityGroup(
      this,
      "BatchSecurityGroup",
      {
        vpc,
      }
    );

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domainName,
    });

    const cert = new acm.Certificate(this, "Certificate", {
      domainName: domainName,
      subjectAlternativeNames: [`ecs.${domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      securityGroup: securityGroupELB,
      internetFacing: true,
    });
    const listenerHTTP = alb.addListener("ListenerHTTP", {
      port: 443,
      certificates: [
        {
          certificateArn: cert.certificateArn,
        },
      ],
    });
    // Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc: vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: Duration.minutes(5),
      },
    });

    listenerHTTP.addTargetGroups("DefaultHTTPSResponse", {
      targetGroups: [targetGroup],
    });

    const securityGroupRDS = new ec2.SecurityGroup(
      this,
      "EcoRdsSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    securityGroupRDS.connections.allowFrom(
      securityGroupApp,
      ec2.Port.tcp(5432),
      "Ingress 5432 from ECS"
    );
    securityGroupRDS.connections.allowFrom(
      securityGroupbatch,
      ec2.Port.tcp(5432),
      "Allow batch tasks to access RDS"
    );
    const rdsCluster = new rds.DatabaseCluster(this, "EcoRds", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_2,
      }),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [securityGroupRDS],
      defaultDatabaseName: "Eco",
      instances: 1, // とりあえず1で設定
      instanceProps: {
        instanceType: new ec2.InstanceType("t3.medium"), // TODO: 最適なスペック検討
        vpc: vpc,
      },
    });

    // RDS定義の後に追加
    // SecretsManager(RDSにより自動設定)
    const secretsmanager = rdsCluster.secret!;

    // Adding bastion host after the VPC definition
    const bastionSecurityGroup = new ec2.SecurityGroup(
      this,
      "BastionSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    bastionSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "allow ssh access from the world"
    );

    const bastion = new ec2.BastionHostLinux(this, "BastionHost", {
      vpc,
      securityGroup: bastionSecurityGroup,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Allow bastion host to connect to RDS
    securityGroupRDS.connections.allowFrom(
      bastionSecurityGroup,
      ec2.Port.tcp(5432),
      "allow postgres from bastion host"
    );

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
    });
    cluster.enableFargateCapacityProviders();
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      "ExistingRepository",
      "economic-school"
    );

    // ECSタスクがSQSキューにメッセージを送信できるようにロールを作成する
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    const sqsPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["sqs:SendMessage"],
      resources: [queue.queueArn],
    });

    taskRole.addToPolicy(sqsPolicyStatement);

    // batch container
    // バッチ処理のタスクロールを作成
    const batchTaskRole = new iam.Role(this, "BatchTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // RDSとの通信を許可するポリシーをタスクロールに追加
    const rdsPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["rds-data:*"],
      resources: ["*"],
    });
    batchTaskRole.addToPolicy(rdsPolicyStatement);

    // バッチ処理用のコンテナイメージ
    const ecrRepositoryForBatch = ecr.Repository.fromRepositoryName(
      this,
      "ExistingRepositoryForBatch",
      "batch-economic-school"
    );
    // バッチ処理のタスク定義を作成
    const batchTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "BatchTaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
        taskRole: batchTaskRole,
        executionRole: batchTaskRole,
      }
    );
    const batchContainer = batchTaskDefinition.addContainer("BatchContainer", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecrRepositoryForBatch,
        "latest"
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "batch-app",
        logRetention: log.RetentionDays.ONE_MONTH,
      }),
      secrets: {
        dbname: ecs.Secret.fromSecretsManager(secretsmanager, "dbname"),
        username: ecs.Secret.fromSecretsManager(secretsmanager, "username"),
        host: ecs.Secret.fromSecretsManager(secretsmanager, "host"),
        port: ecs.Secret.fromSecretsManager(secretsmanager, "port"),
        password: ecs.Secret.fromSecretsManager(secretsmanager, "password"),
      },
    });

    const rule = new events.Rule(this, "ScheduleRule", {
      schedule: events.Schedule.cron({
        // Every Sunday at 11:00am UTC, which is 8:00pm JST
        minute: "0",
        hour: "11",
        weekDay: "SUN",
      }),
    });

    rule.addTarget(
      new targets.EcsTask({
        cluster, // ECS cluster
        taskDefinition: batchTaskDefinition,
        securityGroups: [securityGroupbatch],
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }, // or PRIVATE depending on your setup
      })
    );
    // batch container end

    // Fargate
    const fargateTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
        taskRole: taskRole,
      }
    );
    const container = fargateTaskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "go-app",
        logRetention: log.RetentionDays.FIVE_DAYS,
      }),
      secrets: {
        dbname: ecs.Secret.fromSecretsManager(secretsmanager, "dbname"),
        username: ecs.Secret.fromSecretsManager(secretsmanager, "username"),
        host: ecs.Secret.fromSecretsManager(secretsmanager, "host"),
        password: ecs.Secret.fromSecretsManager(secretsmanager, "password"),
      },
    });
    container.addPortMappings({
      containerPort: 3000,
      hostPort: 3000,
    });
    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: fargateTaskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [securityGroupApp],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          base: 1,
          weight: 1,
        },
      ],
    });
    service.attachToApplicationTargetGroup(targetGroup);

    new route53.ARecord(this, `AliasRecord`, {
      zone: hostedZone,
      recordName: `ecs.${domainName}`,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
    });

    // バウンスメール送信管理のlambda実装

    // SNS Topicを作成
    const topic = new sns.Topic(this, "BounceNotificationTopic");

    // Lambda関数を作成
    const bounceHandlerLambda = new lambda.Function(this, "BounceHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "insertBounceMailCount.bounceHandler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: Duration.seconds(10),
      environment: {
        EMAIL_LOGS_TABLE: "email_logs",
        SECRET_NAME: rdsCluster.secret!.secretName, // RDSのシークレット名を設定
      },
    });

    // SNS TopicへのLambda関数のサブスクリプションを作成
    topic.addSubscription(new subs.LambdaSubscription(bounceHandlerLambda));

    // RDSへのLambda関数のアクセス許可を設定
    const rdsAccessPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["rds-data:ExecuteStatement"],
      resources: ["*"],
    });
    bounceHandlerLambda.addToRolePolicy(rdsAccessPolicyStatement);

    // Lambda関数へのSecretsManagerからの読み取り許可を設定
    secret.grantRead(bounceHandlerLambda);

    // アプリ停止・起動スケジュールlambda

    // Lambda関数用のロールを作成
    const ecsLambdaRole = new iam.Role(this, "EcsLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    ecsLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["ecs:UpdateService", "ecs:DescribeServices"],
      })
    );

    ecsLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // サービスを起動するLambda関数
    const startEcsLambda = new lambda.Function(this, "StartEcsLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "startEcsService.startEcsServiceHandler",
      code: lambda.Code.fromAsset("lambda"),
      role: ecsLambdaRole,
      environment: {
        clusterName: cluster.clusterName,
        serviceName: service.serviceName,
        desiredCount: "1",
      },
    });

    // サービスを停止するLambda関数
    const stopEcsLambda = new lambda.Function(this, "StopEcsLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "stopEcsService.stopEcsServiceHandler",
      code: lambda.Code.fromAsset("lambda"),
      role: ecsLambdaRole,
      environment: {
        clusterName: cluster.clusterName,
        serviceName: service.serviceName,
        desiredCount: "0",
      },
    });

    // CloudWatch Eventsルールを作成してLambda関数をトリガー
    const startEcsSchedule = new events.Rule(this, "StartEcsSchedule", {
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "7",
      }),
    });

    const stopEcsSchedule = new events.Rule(this, "StopEcsSchedule", {
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "0",
      }),
    });

    startEcsSchedule.addTarget(new targets.LambdaFunction(startEcsLambda));
    stopEcsSchedule.addTarget(new targets.LambdaFunction(stopEcsLambda));
  }
}

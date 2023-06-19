#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {
aws_secretsmanager as secretsManager,
} from 'aws-cdk-lib';
import { EcoEcsFargate } from '../lib/eco-ecs-fargate';

const app = new cdk.App();

const secret = secretsManager.Secret.fromSecretNameV2(
  app,
  'secretsForEnv-id',
  'secretsForEnv',
);

new EcoEcsFargate(app, 'EcoEcsFargate', {
  env:{
    account: secret.secretValueFromJson('AWS_ACCOUNT').toString(),
    region: secret.secretValueFromJson('AWS_REGION').toString()
  }
});
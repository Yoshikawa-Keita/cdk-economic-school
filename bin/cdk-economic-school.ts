#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {
aws_secretsmanager as secretsManager,
} from 'aws-cdk-lib';
import { EcoEcsFargate } from '../lib/eco-ecs-fargate';

const app = new cdk.App();

new EcoEcsFargate(app, 'EcoEcsFargate', {
  env:{
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});
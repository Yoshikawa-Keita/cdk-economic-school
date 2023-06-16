#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { CdkEconomicSchoolStack } from '../lib/cdk-economic-school-stack';

const app = new cdk.App();
new CdkEconomicSchoolStack(app, 'CdkEconomicSchoolStack', {
  
});
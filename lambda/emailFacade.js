const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

exports.emailFacadeHandler = async (event) => {
  for (let record of event.Records) {
    let body = JSON.parse(record.body);
    switch(body.EmailType) {
      case 'REGISTER':
        {
          const invokeParams = {
            FunctionName: 'sendVerificationEmailHandler',
            InvocationType: 'Event',
            Payload: JSON.stringify({ Records: [record] }),
          };
          try {
            await lambda.invoke(invokeParams).promise();
          } catch (err) {
            console.error(`Error invoking sendVerificationEmailHandler: ${err}`);
            throw err;
          }
        }
        break;
      case 'CHANGE_PASSWORD':
        {
          const invokeParams = {
            FunctionName: 'sendPasswordResetEmailHandler',
            InvocationType: 'Event',
            Payload: JSON.stringify({ Records: [record] }),
          };
          try {
            await lambda.invoke(invokeParams).promise();
          } catch (err) {
            console.error(`Error invoking sendPasswordResetEmailHandler: ${err}`);
            throw err;
          }
        }
        break;
      case 'CHANGE_EMAIL':
        {
          const invokeParams = {
            FunctionName: 'sendChangeEmailHandler',
            InvocationType: 'Event',
            Payload: JSON.stringify({ Records: [record] }),
          };
          try {
            await lambda.invoke(invokeParams).promise();
          } catch (err) {
            console.error(`Error invoking sendChangeEmailHandler: ${err}`);
            throw err;
          }
        }
        break;
      default:
        console.error(`Unknown email type: ${body.EmailType}`);
    }
  }
};

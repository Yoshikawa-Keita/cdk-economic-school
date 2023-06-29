const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

exports.emailFacadeHandler = async (event) => {
  for (let record of event.Records) {
    let body = JSON.parse(record.body);
    let functionName;
    switch(body.EmailType) {
      case 'REGISTER':
        functionName = process.env.REGISTER_FUNCTION_ARN;
        break;
      case 'CHANGE_PASSWORD':
        functionName = process.env.PASSWORD_RESET_FUNCTION_ARN;
        break;
      case 'CHANGE_EMAIL':
        functionName = process.env.CHANGE_EMAIL_FUNCTION_ARN;
        break;
      case 'DELETE_USER':
        functionName = process.env.DELETE_USER_FUNCTION_ARN;
        break;
      default:
        console.error(`Unknown email type: ${body.EmailType}`);
    }
    const invokeParams = {
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({ Records: [record] }),
    };
    try {
      await lambda.invoke(invokeParams).promise();
    } catch (err) {
      console.error(`Error invoking ${functionName}: ${err}`);
      throw err;
    }
  }
};

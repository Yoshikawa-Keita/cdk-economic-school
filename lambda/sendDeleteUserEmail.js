
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();
const SES = new AWS.SES();


exports.sendDeleteUserEmailHandler = async function(event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const messageBody = JSON.parse(record.body);
    const { Username: username, Email: email } = messageBody;

    const secretValue = await secretsManager.getSecretValue({ SecretId: 'secretsForEnv' }).promise();
    const secrets = JSON.parse(secretValue.SecretString);

    const params = {
      Source: secrets.EMAIL_SENDER_ADDRESS,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: process.env.EMAIL_SUBJECT },
        Body: {
          Html: {
            Data: `username: ${username},<br><br>Your account has been deleted successfully.`,
          },
        },
      },
    };

    try {
      const data = await SES.sendEmail(params).promise();
      console.log("Email sent:", data);
    } catch (err) {
      console.error("Error sending email:", err);
      
      throw err;
    }
  }

};

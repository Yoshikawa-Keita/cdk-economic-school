
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();
const SES = new AWS.SES();


exports.sendVerificationEmailHandler = async function(event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const messageBody = JSON.parse(record.body);
    const { Username: username, Email: email, Email_id: emailId, SecretCode: secretCode } = messageBody;

    const secretValue = await secretsManager.getSecretValue({ SecretId: 'secretsForEnv' }).promise();
    const secrets = JSON.parse(secretValue.SecretString);

    const params = {
      Source: secrets.EMAIL_SENDER_ADDRESS,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: process.env.EMAIL_SUBJECT },
        Body: {
          Html: {
            Data: `Hello ${username},<br><br>Please verify your email by clicking the link below:<br><br><a href="${secrets.FRONTEND_DOMAIN}/verify_email?email_id=${emailId}&secret_code=${secretCode}">Verify Email</a>`,
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
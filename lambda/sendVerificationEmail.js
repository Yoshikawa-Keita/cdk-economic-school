const AWS = require("aws-sdk");
const secretsManager = new AWS.SecretsManager();
const sgMail = require("@sendgrid/mail");

exports.sendVerificationEmailHandler = async function (event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  const secretValue = await secretsManager
    .getSecretValue({ SecretId: "secretsForEnv" })
    .promise();
  const secrets = JSON.parse(secretValue.SecretString);
  sgMail.setApiKey(secrets.SEND_GRID_API_KEY_FOR_ECO);

  for (const record of event.Records) {
    const messageBody = JSON.parse(record.body);
    const {
      Username: username,
      Email: email,
      Email_id: emailId,
      SecretCode: secretCode,
    } = messageBody;

    const msg = {
      to: email,
      from: secrets.EMAIL_SENDER_ADDRESS,
      subject: process.env.EMAIL_SUBJECT,
      html: `Hello ${username},<br><br>Please verify your email by clicking the link below:<br><br><a href="${secrets.FRONTEND_DOMAIN}/verify_email?email_id=${emailId}&secret_code=${secretCode}">Verify Email</a>`,
    };

    try {
      const data = await sgMail.send(msg);
      console.log("Email sent:", data);
    } catch (err) {
      console.error("Error sending email:", err);

      throw err;
    }
  }
};

const AWS = require("aws-sdk");
const secretsManager = new AWS.SecretsManager();
const sgMail = require("@sendgrid/mail");

exports.sendDeleteUserEmailHandler = async function (event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  const secretValue = await secretsManager
    .getSecretValue({ SecretId: "secretsForEnv" })
    .promise();
  const secrets = JSON.parse(secretValue.SecretString);
  sgMail.setApiKey(secrets.SEND_GRID_API_KEY_FOR_ECO);

  for (const record of event.Records) {
    const messageBody = JSON.parse(record.body);
    const { Username: username, Email: email } = messageBody;

    const msg = {
      to: email,
      from: secrets.EMAIL_SENDER_ADDRESS,
      subject: process.env.EMAIL_SUBJECT,
      html: `username: ${username},<br><br>Your account has been deleted successfully.`,
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

const AWS = require('aws-sdk');
const pg = require('pg');

let cachedDbClient;

exports.bounceHandler = async (event) => {
  const secretsManager = new AWS.SecretsManager();
  const secretData = await secretsManager.getSecretValue({ SecretId: process.env.SECRET_NAME }).promise();

  const secretString = secretData.SecretString;
  const dbCredentials = JSON.parse(secretString);

  const dbClient = await getDbClient(dbCredentials);

  try {
    for (const record of event.Records) {
      const snsMessage = JSON.parse(record.Sns.Message);

      if (snsMessage.notificationType === 'Bounce' && snsMessage.bounce.bounceType === 'Permanent') {
        const bouncedRecipients = snsMessage.bounce.bouncedRecipients;

        for (const recipient of bouncedRecipients) {
          console.log(`Email to ${recipient.emailAddress} bounced. Updating the bounce count in the database.`);
          await updateBounceCount(dbClient, recipient.emailAddress);
        }
      }
    }
  } finally {
    await dbClient.end();
  }
};

async function getDbClient(dbCredentials) {
  if (cachedDbClient && cachedDbClient._connected) {
    return cachedDbClient;
  }

  const client = new pg.Client({
    host: dbCredentials.host,
    port: dbCredentials.port,
    database: dbCredentials.dbname,
    user: dbCredentials.username,
    password: dbCredentials.password,
  });

  await client.connect();
  cachedDbClient = client;
  return client;
}

async function updateBounceCount(dbClient, email) {
    const sql = `
      INSERT INTO email_logs(email, bounce_count)
      VALUES ($1, 1)
      ON CONFLICT (email)
      DO UPDATE SET bounce_count = email_logs.bounce_count + 1
    `;
    await dbClient.query(sql, [email]);
  }
  

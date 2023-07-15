const AWS = require("aws-sdk");
const ecs = new AWS.ECS();

exports.stopEcsServiceHandler = async (event) => {
  const params = {
    service: process.env.serviceName,
    cluster: process.env.clusterName,
    desiredCount: parseInt(process.env.desiredCount, 10),
  };

  try {
    const data = await ecs.updateService(params).promise();
    return `Service updated successfully. ${JSON.stringify(data)}`;
  } catch (error) {
    return `Error updating service. ${error}`;
  }
};

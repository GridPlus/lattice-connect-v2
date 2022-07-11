import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

interface Deploy {
  env: string;
  hostname: string;
}

interface Credentials {
  username: string;
  password: string;
}

let config = new pulumi.Config();
let deploy = config.requireObject<Deploy>("deploy")
let credentials = config.requireSecretObject<Credentials>("credentials")

// Subnets
// https://www.pulumi.com/docs/reference/pkg/nodejs/pulumi/awsx/ec2/#subnets
const vpc = new awsx.ec2.Vpc(`lattice-connect-${deploy.env}`, {
  cidrBlock: "172.0.0.0/16",
  subnets: [
    { type: "public" },
    { type: "private" },
  ],
})

const cluster = new awsx.ecs.Cluster("lattice-connect", { vpc, })
const repo = new awsx.ecr.Repository("lattice-connect")

const mqttImage = repo.buildAndPushImage({
  context: "../mqtt-broker",
  dockerfile: `../mqtt-broker/container/Dockerfile`,
  extraOptions: [
    "--platform", "linux/amd64",
    "-t", `mqtt-broker:latest`
  ]
})

const connectImage = repo.buildAndPushImage({
  context: "../connect/",
  cacheFrom: { stages: ["base"] },
  dockerfile: "../connect/container/Dockerfile",
  extraOptions: [
    "--platform", "linux/amd64",
    "-t", "lattice-connect:latest"
  ]
})

const domains = {
  "dev" : "example.com",
  "prod" : "*.gridpl.us"
};

const amazonIssuedSSLCert = pulumi.output(aws.acm.getCertificate({
  domain: deploy.hostname, 
  mostRecent: true,
  types: ["AMAZON_ISSUED"],
}));

const loadBalancer = new awsx.lb
  .NetworkLoadBalancer("lattice-connect-mqtt-lb", { vpc })

const mqttSSLTCPListener = loadBalancer
  .createTargetGroup("lattice-connect-ssl-tg", { port: 1883, vpc })
  .createListener("lattice-connect-mqtt-ssl", {
    protocol: "TLS",
    port: 8883,
    certificateArn: amazonIssuedSSLCert.arn
  })

const mqttWebListener = loadBalancer
  .createTargetGroup("lattice-connect-web-tg", { port: 15672, vpc })
  .createListener("lattice-connect-mqtt-web-list", {
    protocol: "TLS",
    port: 15672,
    certificateArn: amazonIssuedSSLCert.arn
  })

const mqttTaskDefinition = new awsx.ecs.FargateTaskDefinition("lattice-connect-mqtt-task", {
  vpc,
  container: {
    image: mqttImage,
    memory: 8096,
    environment: [
      { name: "ERLANG_COOKIE", value: "erlang-cookie" }
    ],
    portMappings: [
      mqttSSLTCPListener,
      mqttWebListener
    ],
    ulimits: [
      {
        name: "nofile",
        softLimit: 262144,
        hardLimit: 262144
      }
    ]
  }
})

const mqttService = new awsx.ecs.FargateService("lattice-connect-mqtt-serv", {
  cluster,
  assignPublicIp: false,
  taskDefinition: mqttTaskDefinition
})

const appServiceListener = loadBalancer
  .createTargetGroup("lattice-connect-app-tg", { port: 8080, vpc })
  .createListener("lattice-connect-app-ssl", {
    protocol: "TLS",
    port: 443,
    certificateArn: amazonIssuedSSLCert.arn
  })

const appTaskDefinition = credentials.apply( c =>
  new awsx.ecs.FargateTaskDefinition("lattice-connect-app-task", {
    vpc,
    container: {
      image: connectImage,
      environment: [
        { name: "APP_SERVICE_PORT", value: "8080" },
        { name: "ADMIN_CLIENT_HOST", value: `https://${deploy.hostname}:15672` },
        { name: "ADMIN_CLIENT_USER", value: `${c.username}` },
        { name: "ADMIN_CLIENT_PASS", value: `${c.password}` },
        { name: "MQTT_HTTP_PORT", value: "8883" },
      ],
      memory: 512,
      portMappings: [appServiceListener],
      ulimits: [
        { 
          name: "nofile",
          softLimit: 262144,
          hardLimit: 262144
        }
      ]
    } 
  })
)

appTaskDefinition.apply(task =>
  new awsx.ecs.FargateService("lattice-connect-app-serv", {
    cluster,
    desiredCount: 2,
    assignPublicIp: false,
    taskDefinition: task
  })
)

export const appDnsName = loadBalancer.loadBalancer.dnsName

import S3rver from "s3rver";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../.s3rver_data");
const corsConfigPath = path.join(__dirname, "cors.xml");

interface S3rverCallback {
  address: string;
  port: number;
}

const corsConfig = fs.readFileSync(corsConfigPath, "utf-8");

const instance = new S3rver({
  port: 4566,
  // "localhost" resolves to the IPv6 loopback here, but the storage client
  // connects to IPv4 "localhost:4566", and Docker's port publishing can't
  // forward to a loopback-only listener either — bind all interfaces.
  address: "0.0.0.0",
  silent: false,
  directory: dataDir,
  configureBuckets: [
    {
      name: "local-bucket",
      configs: [corsConfig],
    },
  ],
}).run((err: Error | null, data?: S3rverCallback) => {
  if (err) {
    console.error("Failed to start S3rver:", err);
    process.exit(1);
  } else if (data) {
    console.log(`\n✓ S3rver is running at http://${data.address}:${data.port}`);
    console.log(`✓ Bucket: local-bucket`);
    console.log(`✓ Access Key: S3RVER`);
    console.log(`✓ Secret Key: S3RVER\n`);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down S3rver...");
  instance.close(() => {
    process.exit(0);
  });
});

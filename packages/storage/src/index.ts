import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Env } from "@storyframe/schemas/env";

export type R2Env = Pick<
  Env,
  "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET"
>;

/** Key for the R2 object that holds this story's generated asset. */
export function storyAssetKey(storyId: string, ...parts: string[]): string {
  return ["stories", storyId, ...parts].join("/");
}

export interface R2Client {
  upload(key: string, body: Uint8Array, contentType: string): Promise<string>;
  download(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export function createR2(env: R2Env): R2Client {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.R2_BUCKET;

  return {
    async upload(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return key;
    },

    async download(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      if (!res.Body) {
        throw new Error(`R2 object ${key} returned an empty body`);
      }
      return new Uint8Array(await res.Body.transformToByteArray());
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async remove(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
    },
  };
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "NotFound"
  );
}
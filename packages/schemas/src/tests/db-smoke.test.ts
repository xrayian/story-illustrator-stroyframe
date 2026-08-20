import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { stories } from "../db/schema";

const connectionString = process.env.NEON_CONN_STRING;

describe.skipIf(!connectionString)("db smoke", () => {
  it("creates, reads back, and deletes a story row", async () => {
    const db = createDb(connectionString!);

    const [inserted] = await db
      .insert(stories)
      .values({ title: "Smoke Test Story", source_text: "Once upon a time..." })
      .returning({ id: stories.id, title: stories.title });

    expect(inserted.title).toBe("Smoke Test Story");

    const [read] = await db
      .select({ title: stories.title, status: stories.status })
      .from(stories)
      .where(eq(stories.id, inserted.id));

    expect(read).toEqual({ title: "Smoke Test Story", status: "created" });

    await db.delete(stories).where(eq(stories.id, inserted.id));

    const [afterDelete] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(eq(stories.id, inserted.id));
    expect(afterDelete).toBeUndefined();
  });
});